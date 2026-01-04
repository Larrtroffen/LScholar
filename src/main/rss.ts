import axios from 'axios';
import cron from 'node-cron';
import { db, initLanceDB } from './db';
import { callLLM, generateEmbedding } from './ai';
import { VM } from 'vm2';
import * as cheerio from 'cheerio';

export function startScheduler() {
  const feeds = db.prepare('SELECT * FROM rss_feeds').all() as any[];
  feeds.forEach(feed => {
    cron.schedule(feed.cron_schedule, () => fetchRSS(feed.id));
  });
}

export async function fetchRSS(feedId: number) {
  const feed = db.prepare('SELECT * FROM rss_feeds WHERE id = ?').get(feedId) as any;
  const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as any;

  try {
    const response = await axios.get(feed.url, {
      proxy: (feed.proxy_override || settings.proxy_url) ? {
        host: new URL(feed.proxy_override || settings.proxy_url).hostname,
        port: parseInt(new URL(feed.proxy_override || settings.proxy_url).port)
      } : false,
      timeout: 30000
    });

    // 注入 Cheerio 驱动的 DOMParser 模拟器，提供极高的解析稳健性
    const vm = new VM({
      timeout: 10000,
      sandbox: { 
        rssText: response.data,
        // 包装 cheerio 以避免 vm2 环境下的 File/Blob 探测错误
        cheerio: {
          load: (content: string, options?: any) => cheerio.load(content, { xmlMode: true, ...options })
        },
        // 强化补全沙箱环境缺失的全局变量，防止某些库探测环境时报错
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

    const articles = vm.run(`${feed.parsing_script}\nparse(rssText);`);
    
    if (Array.isArray(articles)) {
      // 异步处理文章，不阻塞主循环，提升抓取速度
      articles.forEach(article => {
        // 注入订阅源名称作为期刊名称
        if (!article.journal_info) {
          article.journal_info = JSON.stringify({ name: feed.name });
        }
        processArticle(article, feedId).catch(err => console.error('Error processing article:', err));
      });
    }

    db.prepare('UPDATE rss_feeds SET last_fetch_status = ? WHERE id = ?').run('success', feedId);
    // 抓取完成后执行自动去重
    deduplicateArticles();
  } catch (error) {
    console.error(`Failed to fetch RSS ${feedId}:`, error);
    db.prepare('UPDATE rss_feeds SET last_fetch_status = ? WHERE id = ?').run('failed', feedId);
  }
}

function deduplicateArticles() {
  // 查找标题重复的文章
  const duplicates = db.prepare(`
    SELECT title, COUNT(*) as count 
    FROM articles 
    GROUP BY title 
    HAVING count > 1
  `).all() as any[];

  for (const dup of duplicates) {
    // 优先保留新数据：按 id 降序排列（id 越大通常越新）
    const records = db.prepare('SELECT id FROM articles WHERE title = ? ORDER BY id DESC').all(dup.title) as any[];
    
    // 保留第一条（最新的），删除其余的
    const bestId = records[0].id;
    const idsToDelete = records.slice(1).map(r => r.id);

    if (idsToDelete.length > 0) {
      const placeholders = idsToDelete.map(() => '?').join(',');
      db.prepare(`DELETE FROM articles WHERE id IN (${placeholders})`).run(...idsToDelete);
      
      // 同步清理 LanceDB
      initLanceDB().then(async (conn) => {
        try {
          const table = await conn.openTable('articles');
          for (const id of idsToDelete) {
            await table.delete(`id = ${id}`);
          }
        } catch (e) {
          console.error('Failed to delete from LanceDB during deduplication:', e);
        }
      });
      
      console.log(`Deduplicated: Kept newest article ${bestId} (crawled at ${records[0].created_at || 'unknown'}), removed ${idsToDelete.length} duplicates for title: ${dup.title}`);
    }
  }
}

async function processArticle(article: any, feedId: number) {
  if (!article.title || !article.url) return;

  // 1. 去重检查
  const existing = db.prepare('SELECT id FROM articles WHERE url = ?').get(article.url);
  if (existing) return;

  // 2. 保存到 SQLite
  const info = db.prepare(`
    INSERT INTO articles (rss_feed_id, title, authors, abstract, publication_date, url, doi, journal_info)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    feedId,
    article.title,
    JSON.stringify(article.authors || []),
    article.abstract || "",
    article.publication_date || "",
    article.url || "",
    article.doi || "",
    article.journal_info || ""
  );

  const articleId = Number(info.lastInsertRowid);

  // 3. 生成向量并保存到 LanceDB
  try {
    const textToEmbed = `${article.title} ${article.abstract || ""}`;
    const embedding = await generateEmbedding(textToEmbed);
    const conn = await initLanceDB();
    let table;
    try {
      table = await conn.openTable('articles');
      await table.add([{
        vector: embedding,
        id: articleId,
        text: textToEmbed
      }]);
    } catch (error) {
      await conn.createTable('articles', [{
        vector: embedding,
        id: articleId,
        text: textToEmbed
      }]);
    }
  } catch (e) {
    console.error('Failed to generate embedding or save to LanceDB:', e);
  }
}
