import { db } from '../db';
import { eventBus } from '../events';
import { llmService } from './LLMService';
import { vectorService } from './VectorService';
import { articleService } from './ArticleService';

export class InsightService {
  async generateDailyInsight(): Promise<void> {
    // 1. Get recent articles (e.g., last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const articles = db.prepare('SELECT * FROM articles WHERE created_at > ?').all(oneDayAgo) as any[];

    if (articles.length === 0) {
      return;
    }

    // 2. Summarize
    const titles = articles.map(a => `- ${a.title}`).join('\n');
    const prompt = `
      Here are the titles of articles collected in the last 24 hours:
      ${titles}

      Please provide a concise summary of the key topics and trends represented here.
      Also suggest 3 articles that are most worth reading.
      Return the result in JSON format:
      {
        "summary": "...",
        "recommendations": [
          { "title": "...", "reason": "..." }
        ]
      }
    `;

    try {
      const response = await llmService.chat('insight', [{ role: 'user', content: prompt }]);
      // Parse JSON (simple attempt)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        
        // Save to DB
        const date = new Date().toISOString().split('T')[0];
        db.prepare(`
          INSERT INTO daily_insights (date, summary_text, recommendations_json)
          VALUES (?, ?, ?)
          ON CONFLICT(date) DO UPDATE SET summary_text = excluded.summary_text, recommendations_json = excluded.recommendations_json
        `).run(date, data.summary, JSON.stringify(data.recommendations));

        eventBus.emit('insight:generated', { type: 'daily', content: data.summary });
      }
    } catch (error) {
      console.error('Failed to generate daily insight:', error);
    }
  }

  async generateTopicInsight(topic: string): Promise<any> {
    // 1. Search relevant articles
    const results = await vectorService.search(topic, 20);
    if (results.length === 0) return null;

    // 2. Generate insight
    const context = results.map((r: any) => `Title: ${r.title}\nSummary: ${r.summary || ''}`).join('\n---\n');
    const prompt = `
      I am researching the topic: "${topic}".
      Here are some relevant articles I found:
      ${context}

      Please write a comprehensive insight report on this topic based on these articles.
      Highlight key findings, conflicting views, and future directions.
    `;

    const content = await llmService.chat('insight', [{ role: 'user', content: prompt }]);
    
    // Save to DB
    db.prepare(`
      INSERT INTO topic_insights (title, summary_text)
      VALUES (?, ?)
    `).run(topic, content);

    eventBus.emit('insight:generated', { type: 'topic', content });
    return content;
  }

  async generateSmartExtraction(params: any): Promise<any> {
    // Mock implementation for now, or implement real logic
    // Real logic would involve filtering articles by date/source, then RAG/LLM
    
    // For now, let's just create a dummy entry to satisfy the frontend
    const title = `Smart Extraction ${new Date().toLocaleDateString()}`;
    const summary = "Generated insight based on your preferences.";
    const recommendations = [
      { title: "Example Article 1", type: "Paper", journal: "Nature", score: 0.95, url: "https://www.nature.com" },
      { title: "Example Article 2", type: "News", journal: "TechCrunch", score: 0.88, url: "https://techcrunch.com" }
    ];

    const info = db.prepare(`
      INSERT INTO topic_insights (title, summary_text, recommendations_json, config_json)
      VALUES (?, ?, ?, ?)
    `).run(title, summary, JSON.stringify(recommendations), JSON.stringify(params));

    return {
      success: true,
      data: {
        id: Number(info.lastInsertRowid),
        title,
        summary,
        recommendations
      }
    };
  }

  getAllTopicInsights() {
    return db.prepare('SELECT * FROM topic_insights ORDER BY created_at DESC').all();
  }

  getDailyInsight(date: string) {
    const result = db.prepare('SELECT * FROM daily_insights WHERE date = ?').get(date) as any;
    if (result && result.recommendations_json) {
      result.recommendations = JSON.parse(result.recommendations_json);
    }
    return result;
  }

  deleteTopicInsight(id: number) {
    db.prepare('DELETE FROM topic_insights WHERE id = ?').run(id);
  }

  renameTopicInsight(id: number, title: string) {
    db.prepare('UPDATE topic_insights SET title = ? WHERE id = ?').run(title, id);
  }
}

export const insightService = new InsightService();