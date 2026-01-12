import { db } from '../db';
import { eventBus } from '../events';
import { RSSFeed, Article, FeedGroup } from '../../shared/types';
import { llmService } from './LLMService';
import { configService } from './ConfigService';
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
    return db.prepare('SELECT * FROM rss_feeds').all() as RSSFeed[];
  }

  getGroups(): FeedGroup[] {
    return db.prepare('SELECT * FROM groups').all() as FeedGroup[];
  }

  addFeed(feed: Omit<RSSFeed, 'id'>): RSSFeed {
    const stmt = db.prepare(`
      INSERT INTO rss_feeds (name, url, group_id, proxy_override, parsing_script)
      VALUES (?, ?, ?, ?, ?)
    `);
    const info = stmt.run(feed.name, feed.url, feed.group_id, feed.proxy_override, feed.parsing_script);
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

    if (sets.length > 0) {
      values.push(id);
      db.prepare(`UPDATE rss_feeds SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    }
  }

  deleteFeed(id: number): void {
    db.prepare('DELETE FROM rss_feeds WHERE id = ?').run(id);
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
    eventBus.emit('feed:fetch-start', { feedId: feed.id!, url: feed.url });
    log.info(`Fetching feed: ${feed.name}`, { url: feed.url });
    
    try {
      let articles: Partial<Article>[] = [];

      if (feed.parsing_script) {
        // Use custom parsing script
        log.info(`Using custom parsing script for ${feed.name}`);
        const content = await this.fetchContent(feed.url, feed.proxy_override);
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
      if (!Array.isArray(articles)) {
        log.warn(`Invalid articles array for ${feed.name}, resetting to empty`);
        articles = [];
      }
      
      for (const article of articles) {
        if (article.url && article.title) {
          // Check if exists
          const exists = db.prepare('SELECT id FROM articles WHERE url = ?').get(article.url);
          if (!exists) {
            eventBus.emit('article:discovered', { 
              url: article.url, 
              title: article.title, 
              feedId: feed.id! 
            });
            newCount++;
          }
        }
      }

      db.prepare('UPDATE rss_feeds SET last_updated = CURRENT_TIMESTAMP, error_count = 0 WHERE id = ?').run(feed.id);
      eventBus.emit('feed:fetch-success', { feedId: feed.id!, newArticlesCount: newCount });
      log.info(`Successfully fetched ${feed.name}`, { newArticlesCount: newCount });

    } catch (error: any) {
      db.prepare('UPDATE rss_feeds SET error_count = error_count + 1 WHERE id = ?').run(feed.id);
      eventBus.emit('feed:fetch-error', { feedId: feed.id!, error: error.message });
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
}

export const sourceService = new SourceService();
