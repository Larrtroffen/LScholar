import { db } from '../db';
import { eventBus } from '../events';
import { Article } from '../../shared/types';
import { llmService } from './LLMService';
import { dialog } from 'electron';
import fs from 'fs';

export class ArticleService {
  constructor() {
    this.init();
  }

  private init() {
    eventBus.on('article:discovered', (payload) => {
      this.create({
        feed_id: payload.feedId,
        title: payload.title,
        url: payload.url,
        is_read: false,
        is_favorite: false,
        embedding_status: 'none'
      });
    });
  }

  create(article: Omit<Article, 'id' | 'created_at'>): Article {
    const stmt = db.prepare(`
      INSERT INTO articles (feed_id, title, url, content, summary, publish_date, author, is_read, is_favorite, embedding_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const info = stmt.run(
      article.feed_id,
      article.title,
      article.url,
      article.content,
      article.summary,
      article.publish_date,
      article.author,
      article.is_read ? 1 : 0,
      article.is_favorite ? 1 : 0,
      article.embedding_status
    );

    const newArticle = { ...article, id: Number(info.lastInsertRowid) };
    eventBus.emit('article:created', { id: newArticle.id, title: newArticle.title });
    return newArticle;
  }

  getById(id: number): Article | undefined {
    const row = db.prepare('SELECT * FROM articles WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    return this.mapRowToArticle(row);
  }

  getAll(limit = 100, offset = 0): Article[] {
    const rows = db.prepare('SELECT * FROM articles ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset) as any[];
    return rows.map(this.mapRowToArticle);
  }

  search(query: string): Article[] {
    // Simple SQL LIKE search for now. Full text search or vector search is handled elsewhere.
    const rows = db.prepare(`
      SELECT * FROM articles 
      WHERE title LIKE ? OR content LIKE ? OR summary LIKE ?
      ORDER BY created_at DESC LIMIT 50
    `).all(`%${query}%`, `%${query}%`, `%${query}%`) as any[];
    return rows.map(this.mapRowToArticle);
  }

  markRead(id: number, isRead = true): void {
    db.prepare('UPDATE articles SET is_read = ? WHERE id = ?').run(isRead ? 1 : 0, id);
    eventBus.emit('article:updated', { id, changes: { is_read: isRead } });
  }

  toggleFavorite(id: number): void {
    const article = this.getById(id);
    if (article) {
      const newState = !article.is_favorite;
      db.prepare('UPDATE articles SET is_favorite = ? WHERE id = ?').run(newState ? 1 : 0, id);
      eventBus.emit('article:updated', { id, changes: { is_favorite: newState } });
    }
  }

  updateEmbeddingStatus(id: number, status: Article['embedding_status']): void {
    db.prepare('UPDATE articles SET embedding_status = ? WHERE id = ?').run(status, id);
    eventBus.emit('article:updated', { id, changes: { embedding_status: status } });
  }

  async translateArticle(id: number): Promise<{ trans_title: string; trans_abstract: string }> {
    const article = this.getById(id);
    if (!article) throw new Error('Article not found');

    // Check if already translated (if we store it in DB, which we should)
    // The schema has trans_title and trans_abstract?
    // Let's check db.ts. Yes, migration added them.
    // But `Article` type in `types.ts` doesn't have them.
    // I should update `types.ts` too.
    
    const prompt = `
      Translate the following title and abstract to Chinese (Simplified).
      Return JSON format: { "title": "...", "abstract": "..." }
      
      Title: ${article.title}
      Abstract: ${article.summary || article.content || ''}
    `;

    const response = await llmService.chat('translation', [{ role: 'user', content: prompt }]);
    let result = { title: '', abstract: '' };
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('Translation parse error:', e);
      result = { title: response, abstract: '' }; // Fallback
    }

    // Update DB
    db.prepare('UPDATE articles SET trans_title = ?, trans_abstract = ? WHERE id = ?')
      .run(result.title, result.abstract, id);
      
    return { trans_title: result.title, trans_abstract: result.abstract };
  }

  async exportToRis(ids: number[]): Promise<{ success: boolean; message?: string }> {
    if (ids.length === 0) return { success: false, message: 'No articles selected' };

    const placeholders = ids.map(() => '?').join(',');
    const articles = db.prepare(`SELECT * FROM articles WHERE id IN (${placeholders})`).all(...ids) as any[];

    if (articles.length === 0) return { success: false, message: 'No articles found' };

    const risContent = articles.map(article => {
      const lines = ['TY  - JOUR'];
      lines.push(`TI  - ${article.title}`);
      if (article.author) {
        // Try to parse authors if JSON array
        try {
          const authors = JSON.parse(article.author);
          if (Array.isArray(authors)) {
            authors.forEach(a => lines.push(`AU  - ${a}`));
          } else {
            lines.push(`AU  - ${article.author}`);
          }
        } catch {
          lines.push(`AU  - ${article.author}`);
        }
      }
      if (article.summary) lines.push(`AB  - ${article.summary}`);
      if (article.url) lines.push(`UR  - ${article.url}`);
      if (article.publish_date) lines.push(`DA  - ${article.publish_date}`);
      lines.push('ER  - ');
      return lines.join('\n');
    }).join('\n\n');

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export to RIS',
      defaultPath: 'export.ris',
      filters: [{ name: 'RIS File', extensions: ['ris'] }]
    });

    if (canceled || !filePath) return { success: false, message: 'Cancelled' };

    try {
      fs.writeFileSync(filePath, risContent, 'utf-8');
      return { success: true };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  private mapRowToArticle(row: any): Article {
    return {
      id: row.id,
      feed_id: row.feed_id,
      title: row.title,
      url: row.url,
      content: row.content,
      summary: row.summary,
      publish_date: row.publish_date,
      author: row.author,
      is_read: Boolean(row.is_read),
      is_favorite: Boolean(row.is_favorite),
      embedding_status: row.embedding_status,
      created_at: row.created_at,
      // Add translation fields if I update type
      trans_title: row.trans_title,
      trans_abstract: row.trans_abstract
    } as any; // Cast to any to avoid type error for now until I update types.ts
  }
}

export const articleService = new ArticleService();