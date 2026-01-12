import { getArticlesTable, getLanceConnection, db } from '../db';
import * as lancedb from '@lancedb/lancedb';
import { eventBus } from '../events';
import { articleService } from './ArticleService';
import { configService } from './ConfigService';
import { modelService } from './ModelService';
import OpenAI from 'openai';
import { Worker } from 'worker_threads';
import path from 'path';
import { app } from 'electron';

// 日志工具函数
const log = {
  info: (message: string, data?: any) => {
    console.log(`[VectorService] ${message}`, data || '');
  },
  error: (message: string, error: any) => {
    console.error(`[VectorService] ${message}`, error);
  },
  warn: (message: string, data?: any) => {
    console.warn(`[VectorService] ${message}`, data || '');
  }
};

export class VectorService {
  private worker: Worker | null = null;
  private queue: number[] = [];
  private activeTasks = 0;
  private pendingTasks: Map<string, { resolve: (val: any) => void, reject: (err: any) => void }> = new Map();
  private retryMap: Map<number, number> = new Map(); // 记录重试次数
  private maxRetries = 3;

  constructor() {
    this.init();
  }

  private init() {
    this.initWorker();

    eventBus.on('article:created', (payload) => {
      this.addToQueue(payload.id);
    });
  }

  private initWorker() {
    try {
      const workerPath = app.isPackaged
        ? path.join(process.resourcesPath, 'dist/embedding.worker.js')
        : path.join(__dirname, '../embedding.worker.js');

      this.worker = new Worker(workerPath);

      this.worker.on('message', (data) => {
        if (data.status === 'ready') {
          log.info('Embedding worker ready');
        } else if (data.taskId) {
          const task = this.pendingTasks.get(data.taskId);
          if (task) {
            if (data.success) {
              task.resolve(data.embedding);
            } else {
              task.reject(new Error(data.error));
            }
            this.pendingTasks.delete(data.taskId);
          }
        }
      });

      this.worker.on('error', (err) => {
        log.error('Embedding worker error:', err);
      });

      this.worker.on('exit', (code) => {
        if (code !== 0) {
          log.error(`Embedding worker stopped with exit code ${code}`, null);
        }
      });
    } catch (error) {
      log.error('Failed to init embedding worker:', error);
    }
  }

  private addToQueue(articleId: number) {
    if (!this.queue.includes(articleId)) {
      this.queue.push(articleId);
      articleService.updateEmbeddingStatus(articleId, 'pending');
      eventBus.emit('embedding:queued', { articleId });
      log.info(`Added article ${articleId} to embedding queue`, { queueLength: this.queue.length });
      this.processQueue();
    }
  }

  private async processQueue() {
    const maxConcurrent = configService.getSettings().max_concurrent_tasks || 2;
    
    // 如果队列中有任务且未达到并发限制，启动新任务
    while (this.queue.length > 0 && this.activeTasks < maxConcurrent) {
      const articleId = this.queue.shift();
      if (articleId) {
        this.activeTasks++;
        this.embedArticle(articleId)
          .then(() => {
            articleService.updateEmbeddingStatus(articleId, 'completed');
            eventBus.emit('embedding:success', { articleId });
            log.info(`Successfully embedded article ${articleId}`);
          })
          .catch((error: any) => {
            log.error(`Embedding failed for article ${articleId}:`, error);
            
            // 重试逻辑
            const retryCount = this.retryMap.get(articleId) || 0;
            if (retryCount < this.maxRetries) {
              this.retryMap.set(articleId, retryCount + 1);
              log.warn(`Retrying article ${articleId} (attempt ${retryCount + 1}/${this.maxRetries})`);
              // 将文章重新加入队列头部
              this.queue.unshift(articleId);
            } else {
              articleService.updateEmbeddingStatus(articleId, 'failed');
              eventBus.emit('embedding:error', { articleId, error: error.message });
              this.retryMap.delete(articleId);
            }
          })
          .finally(() => {
            this.activeTasks--;
            // 继续处理队列
            this.processQueue();
          });
      }
    }
  }

  private async embedArticle(articleId: number) {
    const article = articleService.getById(articleId);
    if (!article) return;

    const text = `${article.title}\n\n${article.summary || ''}\n\n${article.content || ''}`.substring(0, 8000);
    const vector = await this.generateEmbedding(text);

    log.info(`Embedding article ${articleId}, vector length: ${vector.length}`);
    
    let table = await getArticlesTable();
    
    // Record data
    const recordData = {
      id: articleId,
      vector: vector,
      title: article.title,
      url: article.url,
      feed_id: article.feed_id,
      publish_date: article.publish_date,
      created_at: new Date().toISOString()
    };
    
    // If table doesn't exist, create it
    if (!table) {
      log.info('Articles table does not exist, creating it...');
      const conn = await getLanceConnection();
      
      try {
        // Create table with first record using the correct API
        table = await conn.createTable('articles', [recordData]);
        log.info('Articles table created successfully');
      } catch (error) {
        log.error('Failed to create table:', error);
        throw error;
      }
    } else {
      // Delete existing record if any
      try {
        await table.delete(`id = ${articleId}`);
        log.info(`Deleted existing record for article ${articleId}`);
      } catch (e) {
        log.warn(`Failed to delete existing record for article ${articleId}:`, e);
      }
      
      // Add new record
      await table.add([recordData]);
    }
    
    log.info(`Successfully added article ${articleId} to vector database`);
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    const assignment = configService.getAssignment('embedding');
    if (!assignment || !assignment.model_id) {
      throw new Error('No embedding model assigned');
    }

    const model = modelService.getById(assignment.model_id);
    if (!model) throw new Error('Assigned embedding model not found');

    if (model.provider === 'openai' || model.provider === 'custom') {
      const openai = new OpenAI({
        baseURL: model.base_url,
        apiKey: model.api_key || 'dummy',
        dangerouslyAllowBrowser: true
      });
      
      const response = await openai.embeddings.create({
        model: model.model_name,
        input: text
      });
      return response.data[0].embedding;
    } else if (model.provider === 'local') {
      if (!this.worker) throw new Error('Worker not initialized');
      
      return new Promise((resolve, reject) => {
        const taskId = Math.random().toString(36).substring(7);
        this.pendingTasks.set(taskId, { resolve, reject });
        
        this.worker!.postMessage({
          taskId,
          modelName: model.model_name,
          cacheDir: path.join(app.getPath('userData'), 'models'),
          text
        });
      });
    } else if (model.provider === 'ollama') {
       const response = await fetch(`${model.base_url}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model.model_name,
          prompt: text
        })
      });
      const data = await response.json() as any;
      return data.embedding;
    }

    throw new Error(`Unsupported embedding provider: ${model.provider}`);
  }

  async search(query: string, limit = 10): Promise<any[]> {
    log.info(`VectorService.search called with query: "${query}", limit: ${limit}`);
    
    try {
      log.info('Generating embedding for query...');
      const vector = await this.generateEmbedding(query);
      log.info('Query embedding generated, vector length:', vector.length);
      
      const conn = await getLanceConnection();
      const table = await conn.openTable('articles');
      log.info('Table obtained successfully');
      
      // Use LanceDB API - search with array and toArray()
      const results = await (table as any)
        .search(vector)
        .limit(limit)
        .toArray();
      
      log.info('Search results count:', results.length);
      if (results.length > 0) {
        log.info('First result:', results[0]);
      }
      
      return results;
    } catch (error) {
      log.error('Vector search failed:', error);
      return [];
    }
  }

  async reset(): Promise<void> {
    const table = await getArticlesTable();
    if (table) {
      try {
        // LanceDB 删除所有数据
        await table.delete('id > 0');
        log.info('Vector table data deleted successfully');
      } catch (error) {
        log.warn('Failed to delete vectors (table may be empty):', error);
      }
    }
    db.prepare("UPDATE articles SET embedding_status = 'none'").run();
    log.info('All article embedding statuses reset to none');
  }

  async getStats(): Promise<any[]> {
    const feeds = db.prepare('SELECT id, name FROM rss_feeds').all() as any[];
    const stats = feeds.map(feed => {
      const total = db.prepare('SELECT COUNT(*) as count FROM articles WHERE feed_id = ?').get(feed.id) as any;
      const embedded = db.prepare("SELECT COUNT(*) as count FROM articles WHERE feed_id = ? AND embedding_status = 'completed'").get(feed.id) as any;
      return {
        feedId: feed.id,
        feedName: feed.name,
        total: total.count,
        embedded: embedded.count,
        percent: total.count > 0 ? Math.round((embedded.count / total.count) * 100) : 0
      };
    });
    return stats;
  }

  async queueFeed(feedId: number): Promise<void> {
    const articles = db.prepare("SELECT id FROM articles WHERE feed_id = ? AND embedding_status != 'completed'").all(feedId) as any[];
    for (const article of articles) {
      this.addToQueue(article.id);
    }
  }
}

export const vectorService = new VectorService();
