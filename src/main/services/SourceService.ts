import { db } from '../db';
import { eventBus } from '../events';
import { RSSFeed, Article, FeedGroup } from '../../shared/types';
import { llmService } from './LLMService';
import { configService } from './ConfigService';
import { parseAndFormatDate } from '../utils/date';
import Parser from 'rss-parser';
import { HttpsProxyAgent } from 'https-proxy-agent';

const parser = new Parser();

// 日志工具函数
const log = {
  info: (message: string, data?: any) => {
    console.log(`[SourceService] ${message}`, data || '');
  },
  error: (message: string, error: any) => {
    console.error(`[SourceService] ${message}`, error);
  },
  warn: (message: string, data?: any) => {
    console.warn(`[SourceService] ${message}`, data || '');
  }
};

export class SourceService {
  private maxConcurrentUpdates = 3; // 最大并发更新数
  private updateQueue: RSSFeed[] = [];
  private activeUpdates = 0;

  constructor() {
    this.init();
  }

  private init() {
    eventBus.on('app:ready', async () => {
      const settings = db.prepare('SELECT auto_update_on_launch FROM settings WHERE id = 1').get() as any;
      if (settings && settings.auto_update_on_launch) {
        await this.updateAll();
      }
    });
  }

  getAllFeeds(): RSSFeed[] {
    // 检查 articles 表是否存在 feed_id 列
    const tableInfo = db.prepare("PRAGMA table_info(articles)").all() as any[];
    const hasFeedId = tableInfo.some(col => col.name === 'feed_id');
    
    let feeds: RSSFeed[];
    if (hasFeedId) {
      feeds = db.prepare(`
        SELECT rf.*, 
          (SELECT COUNT(*) FROM articles a WHERE a.feed_id = rf.id) as article_count,
          CASE 
            WHEN rf.error_count > 3 THEN 'failed'
            ELSE 'success'
          END as last_fetch_status
        FROM rss_feeds rf
      `).all() as RSSFeed[];
    } else {
      // 如果没有 feed_id 列，尝试使用 rss_feed_id
      const hasRssFeedId = tableInfo.some(col => col.name === 'rss_feed_id');
      if (hasRssFeedId) {
        feeds = db.prepare(`
          SELECT rf.*, 
            (SELECT COUNT(*) FROM articles a WHERE a.rss_feed_id = rf.id) as article_count,
            CASE 
              WHEN rf.error_count > 3 THEN 'failed'
              ELSE 'success'
            END as last_fetch_status
          FROM rss_feeds rf
        `).all() as RSSFeed[];
      } else {
        // 如果都没有，直接查询
        feeds = db.prepare(`
          SELECT rf.*, 
            0 as article_count,
            CASE 
              WHEN rf.error_count > 3 THEN 'failed'
              ELSE 'success'
            END as last_fetch_status
          FROM rss_feeds rf
        `).all() as RSSFeed[];
      }
    }
    return feeds;
  }

  getGroups(): FeedGroup[] {
    return db.prepare('SELECT * FROM groups').all() as FeedGroup[];
  }

  addFeed(feed: Omit<RSSFeed, 'id'>): RSSFeed {
    const stmt = db.prepare(`
      INSERT INTO rss_feeds (name, url, group_id, proxy_override, parsing_script, update_interval, cron_schedule)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(feed.name, feed.url, feed.group_id, feed.proxy_override, feed.parsing_script, feed.update_interval, feed.cron_schedule);
    return { ...feed, id: Number(info.lastInsertRowid) };
  }

  updateFeed(id: number, feed: Partial<RSSFeed>): void {
    const sets: string[] = [];
    const values: any[] = [];

    if (feed.name !== undefined) { sets.push('name = ?'); values.push(feed.name); }
    if (feed.url !== undefined) { sets.push('url = ?'); values.push(feed.url); }
    if (feed.group_id !== undefined) { sets.push('group_id = ?'); values.push(feed.group_id); }
    if (feed.proxy_override !== undefined) { sets.push('proxy_override = ?'); values.push(feed.proxy_override); }
    if (feed.parsing_script !== undefined) { sets.push('parsing_script = ?'); values.push(feed.parsing_script); }
    if (feed.update_interval !== undefined) { sets.push('update_interval = ?'); values.push(feed.update_interval); }
    if (feed.cron_schedule !== undefined) { sets.push('cron_schedule = ?'); values.push(feed.cron_schedule); }

    if (sets.length > 0) {
      values.push(id);
      db.prepare(`UPDATE rss_feeds SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    }
  }

  deleteFeed(id: number): void {
    // 先删除该 feed 下的所有文章，避免外键约束失败
    db.prepare('DELETE FROM articles WHERE feed_id = ?').run(id);
    // 再删除 feed
    db.prepare('DELETE FROM rss_feeds WHERE id = ?').run(id);
    log.info(`Deleted feed ${id} and its articles`);
  }

  async updateAll(): Promise<void> {
    const feeds = this.getAllFeeds();
    if (feeds.length === 0) {
      log.info('No feeds to update');
      return;
    }

    eventBus.emit('source:update-start');
    log.info(`Starting update for ${feeds.length} feeds`);
    
    let completed = 0;
    const total = feeds.length;
    const maxConcurrent = configService.getSettings().max_concurrent_tasks || this.maxConcurrentUpdates;

    // 使用并发控制更新所有源
    const updatePromises = feeds.map(async (feed) => {
      // 等待直到有可用的并发槽位
      while (this.activeUpdates >= maxConcurrent) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      this.activeUpdates++;
      try {
        eventBus.emit('source:update-progress', { 
          current: completed, 
          total, 
          message: `Updating ${feed.name}...` 
        });
        await this.fetchFeed(feed);
      } catch (error) {
        log.error(`Failed to update feed ${feed.name}:`, error);
      } finally {
        this.activeUpdates--;
        completed++;
        eventBus.emit('source:update-progress', { current: completed, total });
      }
    });

    await Promise.all(updatePromises);
    eventBus.emit('source:update-complete');
    log.info(`Completed updating ${total} feeds`);
  }

  async fetchFeed(feed: RSSFeed): Promise<void> {
    // 确保 feed.id 是有效的数字
    const feedId = feed.id ? Number(feed.id) : null;
    if (!feedId) {
      log.error(`Invalid feed id: ${feed.id}`);
      return;
    }
    
    eventBus.emit('feed:fetch-start', { feedId, url: feed.url });
      log.info(`Fetching feed: ${feed.name}`, { url: feed.url });
    
    try {
      let articles: Partial<Article>[] = [];

      if (feed.parsing_script) {
        // Use custom parsing script
        log.info(`Using custom parsing script for ${feed.name}`);
        const content = await this.fetchContent(feed.url, feed.proxy_override || undefined);
        articles = await this.executeParsingScript(feed.parsing_script, content);
      } else {
        // Use standard RSS parser
        log.info(`Using standard RSS parser for ${feed.name}`);
        const feedContent = await parser.parseURL(feed.url);
        if (feedContent.items && Array.isArray(feedContent.items)) {
          articles = feedContent.items.map((item: any) => ({
            title: item.title,
            url: item.link,
            content: item.content,
            summary: item.contentSnippet,
            publish_date: item.pubDate,
            author: item.creator
          }));
        }
      }

      let newCount = 0;
      let skippedEmptyUrl = 0;
      let deletedEmptyUrl = 0;
      if (!Array.isArray(articles)) {
        log.warn(`Invalid articles array for ${feed.name}, resetting to empty`);
        articles = [];
      }
      
      // 1. 先删除当前订阅源下所有 url 为空的文章
      const deleteResult = db.prepare("DELETE FROM articles WHERE feed_id = ? AND (url IS NULL OR url = '')").run(feedId);
      deletedEmptyUrl = deleteResult.changes;
      
      // 2. 过滤空链接，不插入
      for (const article of articles) {
        if (!article.url || !article.url.trim()) {
          skippedEmptyUrl++;
          continue;
        }
        
        if (!article.title) {
          article.title = '无标题';
        }
        
        // 3. 统一日期格式为 YYYY-MM-DD
        const formattedDate = parseAndFormatDate(article.publish_date || '');
        
        // 4. 先检查是否已存在相同标题的文章（用于处理 URL 变化的源如知网）
        const existingArticle = db.prepare(
          'SELECT id FROM articles WHERE feed_id = ? AND title = ?'
        ).get(feedId, article.title);
        
        if (existingArticle) {
          log.info(`Skipped duplicate article by title: ${article.title}`);
          continue;
        }
        
        // 5. 插入新文章
        try {
          const stmt = db.prepare(`
            INSERT INTO articles (feed_id, title, url, content, summary, publish_date, author)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `);
          const info = stmt.run(
            feedId,
            article.title,
            article.url,
            article.content || null,
            article.summary || null,
            formattedDate,
            article.author || null
          );
          
          eventBus.emit('article:discovered', { 
            url: article.url, 
            title: article.title, 
            feedId 
          });
          newCount++;
        } catch (insertError: any) {
          log.warn(`Failed to insert article: ${article.url}`, insertError);
        }
      }
      
      if (deletedEmptyUrl > 0) {
        log.info(`Deleted ${deletedEmptyUrl} articles with empty URL in ${feed.name}`);
      }
      if (skippedEmptyUrl > 0) {
        log.info(`Skipped ${skippedEmptyUrl} articles with empty URL in ${feed.name}`);
      }

      db.prepare('UPDATE rss_feeds SET last_updated = CURRENT_TIMESTAMP, error_count = 0 WHERE id = ?').run(feedId);
      eventBus.emit('feed:fetch-success', { feedId, newArticlesCount: newCount });
      log.info(`Successfully fetched ${feed.name}`, { newArticlesCount: newCount });

    } catch (error: any) {
      db.prepare('UPDATE rss_feeds SET error_count = error_count + 1 WHERE id = ?').run(feedId);
      eventBus.emit('feed:fetch-error', { feedId, error: error.message });
      log.error(`Failed to fetch feed ${feed.name}:`, error);
      throw error;
    }
  }

  private async fetchContent(url: string, proxy?: string): Promise<string> {
    const options: any = {
      timeout: 30000 // 30秒超时
    };
    if (proxy) {
      options.agent = new HttpsProxyAgent(proxy);
    }
    
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      return await res.text();
    } catch (error: any) {
      log.error(`Failed to fetch content from ${url}:`, error);
      throw error;
    }
  }

  private async executeParsingScript(script: string, content: string): Promise<Partial<Article>[]> {
    // Safe execution sandbox could be implemented here.
    // For now, we use a simple Function constructor, assuming the script returns an array of objects.
    // The script should be a function body that takes 'content' as argument and returns array.
    // Example script: "const $ = cheerio.load(content); return $('a').map(...).get();"
    // Note: This requires cheerio or other libs to be available if used.
    // For simplicity, let's assume the script is a full function body:
    // `return (function(content) { ... })(content)`
    
    // WARNING: This is dangerous if scripts are untrusted.
    try {
      const parseFn = new Function('content', script);
      const result = parseFn(content);
      
      if (!Array.isArray(result)) {
        log.warn('Parsing script did not return an array');
        return [];
      }
      
      return result;
    } catch (e: any) {
      log.error('Script execution failed:', e);
      return [];
    }
  }

  async fetchRawRss(url: string): Promise<any> {
    try {
      log.info(`Fetching raw RSS from ${url}`);
      const feedContent = await parser.parseURL(url);
      return {
        success: true,
        title: feedContent.title,
        description: feedContent.description,
        items: feedContent.items ? feedContent.items.slice(0, 5) : []
      };
    } catch (error: any) {
      log.error('Failed to fetch raw RSS:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async generateScript(url: string): Promise<string> {
    try {
      log.info(`Generating parsing script for ${url}`);
      const content = await this.fetchContent(url);
      const snippet = content.substring(0, 3000); // First 3k chars

      const prompt = `
        Analyze the following HTML/XML content and write a JavaScript function body that parses it to extract a list of articles.
        The function should return an array of objects with the following structure:
        {
          title: string,
          url: string,
          content: string (optional),
          summary: string (optional),
          publish_date: string (optional),
          author: string (optional)
        }
        
        The input variable is named 'content'.
        Do not use external libraries like cheerio unless you can guarantee they are available (currently they are NOT).
        Use regex or simple string manipulation if possible, or DOMParser if running in browser context (but this runs in Node).
        Actually, since this runs in Node.js, you can't use DOMParser.
        Please write a robust regex-based parser or string manipulation logic.
        
        Return ONLY the function body code.
        
        Content snippet:
        ${snippet}
      `;

      const script = await llmService.chat('script_generation', [{ role: 'user', content: prompt }]);
      const cleanedScript = script.replace(/```javascript|```/g, '').trim();
      log.info('Successfully generated parsing script');
      return cleanedScript;
    } catch (error: any) {
      log.error('Failed to generate script:', error);
      throw error;
    }
  }

  async debugScript(url: string, script: string): Promise<{
    success: boolean;
    contentSnippet?: string;
    totalArticles?: number;
    firstArticle?: any;
    articlesList?: any[];
    fieldAnalysis?: Record<string, string>;
    error?: string
  }> {
    try {
      log.info(`Debugging script for ${url}`);
      const content = await this.fetchContent(url);
      const articles = await this.executeParsingScript(script, content);
      
      if (articles.length === 0) {
        return { success: true, firstArticle: null, totalArticles: 0 };
      }
      
      // 字段分析
      const fieldAnalysis: Record<string, string> = {};
      const allFields = ['title', 'url', 'content', 'summary', 'publish_date', 'author'];
      
      for (const field of allFields) {
        const values = articles.map((a: any) => a[field]).filter((v: any) => v !== undefined && v !== null && v !== '');
        const sample = values[0] || '';
        const type = values.length > 0 ? typeof sample : 'undefined';
        fieldAnalysis[field] = `${type}, sample: ${String(sample).substring(0, 80)}${String(sample).length > 80 ? '...' : ''}`;
      }
      
      // 提取前 10 条的摘要信息
      const articlesList = articles.slice(0, 10).map((a: any) => ({
        title: a.title || '无标题',
        url: a.url || '无链接',
        author: a.author || '-',
        publish_date: a.publish_date || '-'
      }));
      
      return {
        success: true,
        contentSnippet: content.substring(0, 500),
        totalArticles: articles.length,
        firstArticle: articles[0],
        articlesList,
        fieldAnalysis
      };
    } catch (error: any) {
      log.error('Failed to debug script:', error);
      return { success: false, error: error.message };
    }
  }
}

export const sourceService = new SourceService();
