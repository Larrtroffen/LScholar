import { ipcMain, dialog } from 'electron';
import { db, initLanceDB } from './db';
import { callLLM, generateEmbedding } from './ai';
import { fetchRSS } from './rss';
import fs from 'fs';
import axios from 'axios';
import { VM } from 'vm2';
import * as cheerio from 'cheerio';

export function registerIpcHandlers() {
  // Settings
  ipcMain.handle('get-settings', () => {
    return db.prepare('SELECT * FROM settings WHERE id = 1').get();
  });

  ipcMain.handle('save-settings', (_, settings) => {
    const stmt = db.prepare(`
      UPDATE settings SET 
        llm_base_url = ?, 
        llm_api_key = ?, 
        llm_model_name = ?, 
        embedding_model_name = ?, 
        rerank_model_name = ?, 
        proxy_url = ?, 
        user_preferences = ?,
        translation_enabled = ?,
        translation_mode = ?,
        trans_llm_base_url = ?,
        trans_llm_api_key = ?,
        trans_llm_model_name = ?
      WHERE id = 1
    `);
    stmt.run(
      settings.llm_base_url,
      settings.llm_api_key,
      settings.llm_model_name,
      settings.embedding_model_name,
      settings.rerank_model_name,
      settings.proxy_url,
      settings.user_preferences,
      settings.translation_enabled ? 1 : 0,
      settings.translation_mode,
      settings.trans_llm_base_url,
      settings.trans_llm_api_key,
      settings.trans_llm_model_name
    );
    return { success: true };
  });

  ipcMain.handle('test-connection', async (_, settings) => {
    try {
      const originalSettings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as any;
      db.prepare('UPDATE settings SET llm_base_url = ?, llm_api_key = ?, llm_model_name = ? WHERE id = 1')
        .run(settings.llm_base_url, settings.llm_api_key, settings.llm_model_name);
      
      await callLLM("Say hello", "You are a test assistant.");
      
      db.prepare('UPDATE settings SET llm_base_url = ?, llm_api_key = ?, llm_model_name = ? WHERE id = 1')
        .run(originalSettings.llm_base_url, originalSettings.llm_api_key, originalSettings.llm_model_name);
      
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // RSS Feeds
  ipcMain.handle('get-feeds', () => {
    const feeds = db.prepare('SELECT * FROM rss_feeds').all() as any[];
    return feeds.map(feed => {
      const stats = db.prepare('SELECT COUNT(*) as count FROM articles WHERE rss_feed_id = ?').get(feed.id) as any;
      return { ...feed, article_count: stats.count };
    });
  });

  ipcMain.handle('add-feed', async (_, feed) => {
    const stmt = db.prepare(`
      INSERT INTO rss_feeds (name, url, parsing_script, cron_schedule, group_id)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(feed.name, feed.url, feed.parsing_script, feed.cron_schedule, feed.group_id);
    const lastId = Number(result.lastInsertRowid);
    // 在后台运行抓取，不阻塞响应
    fetchRSS(lastId).catch(err => console.error('Initial fetch failed:', err));
    return { success: true, id: lastId };
  });

  ipcMain.handle('update-feed', async (_, feed) => {
    const stmt = db.prepare(`
      UPDATE rss_feeds SET 
        name = ?, 
        url = ?, 
        parsing_script = ?, 
        cron_schedule = ?, 
        group_id = ?
      WHERE id = ?
    `);
    stmt.run(feed.name, feed.url, feed.parsing_script, feed.cron_schedule, feed.group_id, feed.id);
    return { success: true };
  });

  ipcMain.handle('delete-feed', (_, id) => {
    db.transaction(() => {
      db.prepare('DELETE FROM articles WHERE rss_feed_id = ?').run(id);
      db.prepare('DELETE FROM rss_feeds WHERE id = ?').run(id);
    })();
    return { success: true };
  });

  // Articles
  ipcMain.handle('get-articles', (_, { feedId, groupId, limit = 50, offset = 0 }) => {
    let query = 'SELECT * FROM articles';
    const params: any[] = [];

    if (feedId) {
      query += ' WHERE rss_feed_id = ?';
      params.push(feedId);
    } else if (groupId) {
      query += ' WHERE rss_feed_id IN (SELECT id FROM rss_feeds WHERE group_id = ?)';
      params.push(groupId);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return db.prepare(query).all(...params);
  });

  ipcMain.handle('toggle-favorite', (_, { id, isFavorited }) => {
    const now = isFavorited ? new Date().toISOString() : null;
    db.prepare('UPDATE articles SET is_favorited = ?, favorited_at = ? WHERE id = ?')
      .run(isFavorited ? 1 : 0, now, id);
    return { success: true };
  });

  // General AI
  ipcMain.handle('general-ai', async (_, { prompt, systemRole }) => {
    try {
      return await callLLM(prompt, systemRole);
    } catch (error: any) {
      throw new Error(`AI 调用失败: ${error.message}`);
    }
  });

  // RAG / AI Chat
  ipcMain.handle('ask-ai', async (_, { question }) => {
    const embedding = await generateEmbedding(question);
    const conn = await initLanceDB();
    
    let table;
    try {
      table = await conn.openTable('articles');
    } catch (error) {
      return "目前还没有抓取到任何文献，请先添加订阅源并等待抓取完成。";
    }

    const results = await table.vectorSearch(embedding).limit(5).toArray();
    const context = results.map((r: any) => r.text).join('\n\n');
    const prompt = `Context:\n${context}\n\nQuestion: ${question}\n\nAnswer based on the context. If the context doesn't contain the answer, say you don't know.`;
    
    return await callLLM(prompt);
  });

  // Groups
  ipcMain.handle('get-groups', () => {
    return db.prepare('SELECT * FROM groups').all();
  });

  ipcMain.handle('add-group', (_, name) => {
    const result = db.prepare('INSERT INTO groups (name) VALUES (?)').run(name);
    return { success: true, id: Number(result.lastInsertRowid) };
  });

  // Chat History
  ipcMain.handle('get-chat-history', () => {
    return db.prepare('SELECT * FROM chat_history ORDER BY created_at DESC').all();
  });

  ipcMain.handle('save-chat', (_, { id, title, messages }) => {
    if (id) {
      db.prepare('UPDATE chat_history SET messages = ? WHERE id = ?')
        .run(JSON.stringify(messages), id);
      return { success: true, id };
    } else {
      const result = db.prepare('INSERT INTO chat_history (title, messages) VALUES (?, ?)')
        .run(title, JSON.stringify(messages));
      return { success: true, id: Number(result.lastInsertRowid) };
    }
  });

  ipcMain.handle('delete-chat', (_, id) => {
    db.prepare('DELETE FROM chat_history WHERE id = ?').run(id);
    return { success: true };
  });

  // Export
  ipcMain.handle('export-to-ris', async (_, articleIds) => {
    try {
      const articles = db.prepare(`SELECT * FROM articles WHERE id IN (${articleIds.map(() => '?').join(',')})`)
        .all(...articleIds) as any[];

      let risContent = '';
      articles.forEach(art => {
        risContent += 'TY  - JOUR\n';
        risContent += `TI  - ${art.title}\n`;
        try {
          const authors = JSON.parse(art.authors);
          if (Array.isArray(authors)) {
            authors.forEach((auth: string) => {
              risContent += `AU  - ${auth}\n`;
            });
          } else {
            risContent += `AU  - ${authors}\n`;
          }
        } catch {
          risContent += `AU  - ${art.authors}\n`;
        }
        risContent += `AB  - ${art.abstract}\n`;
        risContent += `PY  - ${art.publication_date}\n`;
        risContent += `UR  - ${art.url}\n`;
        if (art.doi) risContent += `DO  - ${art.doi}\n`;
        risContent += 'ER  - \n\n';
      });

      const { filePath } = await dialog.showSaveDialog({
        defaultPath: 'LScholar_Export.ris',
        filters: [{ name: 'RIS File', extensions: ['ris'] }]
      });

      if (filePath) {
        fs.writeFileSync(filePath, risContent);
        return { success: true };
      }
      return { success: false };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Manual Feed Update
  ipcMain.handle('update-all-feeds', async (event) => {
    const feeds = db.prepare('SELECT id FROM rss_feeds').all() as any[];
    let completed = 0;
    for (const feed of feeds) {
      await fetchRSS(feed.id);
      completed++;
      event.sender.send('update-progress', {
        current: completed,
        total: feeds.length,
        percent: Math.round((completed / feeds.length) * 100)
      });
    }
    return { success: true };
  });

  ipcMain.handle('update-feed-data', async (_, feedId) => {
    await fetchRSS(feedId);
    return { success: true };
  });

  ipcMain.handle('translate-article', async (_, { articleId }) => {
    const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(articleId) as any;
    if (!article) throw new Error('Article not found');

    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as any;

    const prompt = `你是一个专业的学术翻译专家。请将以下学术文献的标题和摘要翻译成中文。
    
    标题: ${article.title}
    摘要: ${article.abstract}
    
    请严格按照以下 JSON 格式返回：
    {
      "title": "翻译后的标题",
      "abstract": "翻译后的摘要"
    }`;

    // 使用专门的翻译 LLM 配置
    const response = await callLLM(
      prompt, 
      "你是一个专业的学术翻译助手。请只返回 JSON 格式。",
      2000,
      settings.trans_llm_base_url || settings.llm_base_url,
      settings.trans_llm_api_key || settings.llm_api_key,
      settings.trans_llm_model_name || settings.llm_model_name
    );

    let data;
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('AI 返回格式错误');
      data = JSON.parse(jsonMatch[0]);
    } catch (e) {
      throw new Error('翻译解析失败');
    }

    db.prepare('UPDATE articles SET trans_title = ?, trans_abstract = ? WHERE id = ?')
      .run(data.title, data.abstract, articleId);
    
    return { success: true, trans_title: data.title, trans_abstract: data.abstract };
  });

  ipcMain.handle('rerun-insights', async (_, { count = 10, date } = {}) => {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as any;
    const preferences = settings.user_preferences || "无特定偏好";

    // 明确使用 created_at (抓取日期) 进行筛选
    const articles = db.prepare('SELECT title, abstract, url, journal_info FROM articles WHERE date(created_at) = date(?)').all(targetDate) as any[];
    
    if (articles.length === 0) {
      throw new Error(`${targetDate} 尚无新抓取的文献，无法生成洞察。`);
    }

    const context = articles.map(a => {
      let journal = "Unknown";
      try { journal = JSON.parse(a.journal_info).name; } catch(e) {}
      return `Title: ${a.title}\nJournal: ${journal}\nAbstract: ${a.abstract}\nURL: ${a.url}`;
    }).join('\n\n');

    const prompt = `你是一个学术洞察专家。请分析以下在 ${targetDate} 抓取的文献，并结合用户的研究偏好生成一份简短的总结（约150字）和 ${count} 条推荐。
    
    用户研究偏好（关键词）：
    ${preferences}

    文献内容：
    ${context}
    
    要求：
    1. 总结应概括今日文献的整体趋势，并特别指出与用户研究偏好相关的进展。
    2. 推荐列表应优先选择与用户研究偏好匹配度高的文章。
    3. 请严格按照以下 JSON 格式返回，确保包含文章的真实 URL 以便跳转：
    {
      "summary": "总结内容...",
      "recommendations": [
        {"title": "标题", "score": 0.95, "type": "强相关", "journal": "期刊名", "url": "文章真实URL"},
        ...
      ]
    }`;

    // 根据推荐数量动态调整 max_tokens，每条推荐预留约 150 tokens
    const dynamicMaxTokens = Math.min(8192, Math.max(4000, count * 150));
    
    const response = await callLLM(prompt, "你是一个专业的学术分析助手。请只返回 JSON 格式。", dynamicMaxTokens);
    
    let data;
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('AI 返回格式错误');
      data = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.warn('JSON parsing failed, attempting repair...', e);
      // 鲁棒性修复：如果 JSON 被截断，尝试提取已完成的数组项
      try {
        const partialMatch = response.match(/"recommendations":\s*\[([\s\S]*?)\]/);
        const summaryMatch = response.match(/"summary":\s*"([\s\S]*?)"/);
        
        if (summaryMatch && partialMatch) {
          const itemsRaw = partialMatch[1];
          // 匹配所有完整的对象 { ... }
          const validItems = [];
          const itemRegex = /\{[^{}]*?\}/g;
          let m;
          while ((m = itemRegex.exec(itemsRaw)) !== null) {
            try {
              validItems.push(JSON.parse(m[0]));
            } catch (innerE) {}
          }
          
          data = {
            summary: summaryMatch[1],
            recommendations: validItems
          };
        } else {
          throw new Error('无法从截断的响应中恢复数据');
        }
      } catch (repairE) {
        throw new Error('AI 返回内容过长且无法解析，请尝试减少推荐数量。');
      }
    }
    
    db.prepare('INSERT OR REPLACE INTO daily_insights (date, summary_text, recommendations_json) VALUES (?, ?, ?)')
      .run(targetDate, data.summary, JSON.stringify(data.recommendations));
      
    return { success: true };
  });

  ipcMain.handle('get-insights', (_, date) => {
    return db.prepare('SELECT * FROM daily_insights WHERE date = ?').get(date);
  });

  ipcMain.handle('fetch-raw-rss', async (_, url) => {
    try {
      const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as any;
      const response = await axios.get(url, {
        proxy: settings.proxy_url ? {
          host: new URL(settings.proxy_url).hostname,
          port: parseInt(new URL(settings.proxy_url).port)
        } : false,
        timeout: 10000
      });
      return { success: true, data: response.data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('debug-rss', async (_, { url, script }) => {
    try {
      const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as any;
      const response = await axios.get(url, {
        proxy: settings.proxy_url ? {
          host: new URL(settings.proxy_url).hostname,
          port: parseInt(new URL(settings.proxy_url).port)
        } : false,
        timeout: 10000
      });

      const vm = new VM({
        timeout: 5000,
        sandbox: { 
          rssText: response.data,
          cheerio: {
            load: (content: string, options?: any) => cheerio.load(content, { xmlMode: true, ...options })
          },
          // 强化补全，彻底解决 cheerio 内部探测导致的 File is not defined
          File: class {},
          Blob: class {},
          self: {},
          window: {},
          DOMParser: class {
            parseFromString(xml: string) {
              const $ = cheerio.load(xml, { xmlMode: true });
              const createNode = (el: any) => {
                const $el = $(el);
                return {
                  textContent: $el.text().trim(),
                  querySelector: (selector: string) => {
                    const found = $el.find(selector.replace(/:/g, '\\:')).first();
                    return found.length > 0 ? createNode(found) : createNode(null);
                  },
                  querySelectorAll: (selector: string) => {
                    return $el.find(selector.replace(/:/g, '\\:')).map((_i: any, e: any) => createNode(e)).get();
                  },
                  getElementsByTagName: (tag: string) => {
                    return $el.find(tag.replace(/:/g, '\\:')).map((_i: any, e: any) => createNode(e)).get();
                  },
                  getElementsByTagNameNS: (ns: string, tag: string) => {
                    return $el.find(tag.replace(/:/g, '\\:')).map((_i: any, e: any) => createNode(e)).get();
                  },
                  getAttribute: (attr: string) => $el.attr(attr) || null
                };
              };
              return createNode($.root());
            }
          }
        }
      });

      const articles = vm.run(`${script}\nparse(rssText);`);
      // 关键修复：使用 JSON 序列化再反序列化，确保从沙箱返回的是纯粹的普通对象，彻底解决 Electron 克隆错误
      const sanitizedArticle = articles && Array.isArray(articles) && articles.length > 0 
        ? JSON.parse(JSON.stringify(articles[0])) 
        : null;
      return { success: true, firstArticle: sanitizedArticle };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}
