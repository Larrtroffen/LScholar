import { db } from '../db';
import { llmService } from './LLMService';
import { vectorService } from './VectorService';

export class ChatService {
  async askAI(question: string): Promise<string> {
    // 1. Search relevant context
    const context = await vectorService.search(question);
    const contextText = context.map(c => `Title: ${c.title}\nContent: ${c.text}`).join('\n\n');

    // 2. Construct prompt
    const messages = [
      { role: 'system' as const, content: `You are an academic research assistant. Answer the user's question based on the provided context. If the context doesn't contain the answer, say so, but try to be helpful.
      
      Context:
      ${contextText}` },
      { role: 'user' as const, content: question }
    ];

    // 3. Call LLM
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