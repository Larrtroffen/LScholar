import { db } from '../db';
import { llmService } from './LLMService';
import { vectorService } from './VectorService';
import { articleService } from './ArticleService';

export class ChatService {
  async askAI(question: string): Promise<string> {
    // 1. Search for the 10 most relevant articles from vector database
    const context = await vectorService.search(question, 10);
    
    if (context.length === 0) {
      return '抱歉，未找到与您问题相关的文献。请确保已有文献被嵌入到向量库中。';
    }
    
    // 2. Build context text by fetching full article content from SQLite
    const contextParts = await Promise.all(context.map(async (c: any) => {
      const article = articleService.getById(c.id);
      if (!article) return '';
      
      // Get feed name as source
      const feed = db.prepare('SELECT name FROM rss_feeds WHERE id = ?').get(article.feed_id) as any;
      const sourceName = feed?.name || '未知来源';
      
      const content = article.summary || article.content || '';
      const author = article.author || '未知作者';
      
      return `【文献 ${c.id}】标题: ${article.title}
作者: ${author}
来源: ${sourceName}
摘要: ${content}
匹配度: ${(c.score * 100).toFixed(1)}%`;
    }));
    
    const contextText = contextParts.filter(p => p).join('\n\n---\n\n');

    // 3. Construct prompt with enhanced context
    const messages = [
      { role: 'system' as const, content: `你是一位学术研究助手。请根据提供的相关文献上下文回答用户的问题。

要求：
1. 优先使用提供的文献内容来回答问题
2. 在回答中引用具体的文献信息（标题、作者、来源等）
3. 如果上下文信息不足以回答问题，请明确说明
4. 保持回答的学术性和专业性
5. 简洁明了地组织回答内容

以下是与问题最相关的 10 篇文献：

${contextText}` },
      { role: 'user' as const, content: question }
    ];

    // 4. Call LLM
    return await llmService.chat('main_chat', messages);
  }

  getAllChats() {
    return db.prepare('SELECT * FROM chat_history ORDER BY created_at DESC').all();
  }

  saveChat(id: number | null, title: string, messages: any[]) {
    const messagesJson = JSON.stringify(messages);
    if (id) {
      db.prepare('UPDATE chat_history SET title = ?, messages = ? WHERE id = ?').run(title, messagesJson, id);
      return { success: true, id };
    } else {
      const info = db.prepare('INSERT INTO chat_history (title, messages) VALUES (?, ?)').run(title, messagesJson);
      return { success: true, id: Number(info.lastInsertRowid) };
    }
  }

  deleteChat(id: number) {
    db.prepare('DELETE FROM chat_history WHERE id = ?').run(id);
    return { success: true };
  }
}

export const chatService = new ChatService();