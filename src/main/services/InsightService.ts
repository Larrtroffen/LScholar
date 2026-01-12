import { db } from '../db';
import { eventBus } from '../events';
import { llmService } from './LLMService';
import { vectorService } from './VectorService';
import { articleService } from './ArticleService';
import { configService } from './ConfigService';

export class InsightService {
  /**
   * 获取用户研究偏好
   * @param type 'daily' | 'topic' | 'global' 偏好类型
   */
  private getUserResearchPreferences(type: 'daily' | 'topic' | 'global' = 'global'): string[] {
    try {
      const settings = configService.getSettings();
      console.log(`[InsightService] getUserResearchPreferences for type: ${type}`);
      console.log(`[InsightService] settings.user_preferences:`, settings.user_preferences);
      
      if (settings.user_preferences) {
        const prefs = JSON.parse(settings.user_preferences);
        console.log(`[InsightService] parsed prefs:`, prefs);
        
        // 根据类型获取对应的偏好
        if (type === 'daily' && prefs.daily_insight_preferences?.interests) {
          console.log(`[InsightService] Found daily_insight_preferences.interests:`, prefs.daily_insight_preferences.interests);
          return prefs.daily_insight_preferences.interests;
        }
        if (type === 'topic' && prefs.topic_insight_preferences?.interests) {
          console.log(`[InsightService] Found topic_insight_preferences.interests:`, prefs.topic_insight_preferences.interests);
          return prefs.topic_insight_preferences.interests;
        }
        
        // 回退到全局偏好
        if (prefs.interests && Array.isArray(prefs.interests)) {
          console.log(`[InsightService] Found global interests:`, prefs.interests);
          return prefs.interests;
        }
        if (prefs.research_interests && Array.isArray(prefs.research_interests)) {
          console.log(`[InsightService] Found global research_interests:`, prefs.research_interests);
          return prefs.research_interests;
        }
        if (prefs.topics && Array.isArray(prefs.topics)) {
          console.log(`[InsightService] Found global topics:`, prefs.topics);
          return prefs.topics;
        }
      }
    } catch (error) {
      console.error('[InsightService] Failed to parse user preferences:', error);
    }
    console.log(`[InsightService] No interests found for type: ${type}`);
    return [];
  }

  async generateDailyInsight(targetCount: number = 10): Promise<void> {
    console.log('[InsightService] generateDailyInsight called with targetCount:', targetCount);
    
    // 1. 获取每日洞察的专属研究偏好
    const interests = this.getUserResearchPreferences('daily');
    
    // 2. SQL 查询最近 24h 的全部文章
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const allArticles = db.prepare('SELECT * FROM articles WHERE created_at > ? ORDER BY created_at DESC').all(oneDayAgo) as any[];
    console.log(`[InsightService] Found ${allArticles.length} articles in last 24h`);
    
    if (allArticles.length === 0) {
      console.log('[InsightService] No articles found for daily insight');
      return;
    }
    
    let selectedArticles: any[] = [];
    
    // 3. 使用向量搜索进行排序/筛选
    if (interests.length > 0) {
      console.log('[InsightService] Using vector search with interests:', interests);
      const searchQuery = interests.join(' ');
      
      try {
        const searchResults = await vectorService.search(searchQuery, targetCount * 3);
        const relevantIds = new Set(searchResults.map((r: any) => r.id));
        
        // 优先选择相关度高的文章
        const relevantArticles = allArticles.filter(a => relevantIds.has(a.id));
        const otherArticles = allArticles.filter(a => !relevantIds.has(a.id));
        
        // 按相关度排序后取 targetCount 篇
        selectedArticles = relevantArticles.slice(0, targetCount);
        
        // 如果不够，补充不相关的文章
        if (selectedArticles.length < targetCount) {
          const remaining = targetCount - selectedArticles.length;
          selectedArticles = [...selectedArticles, ...otherArticles.slice(0, remaining)];
        }
        
        console.log(`[InsightService] Selected ${selectedArticles.length} articles by vector search`);
      } catch (error) {
        console.warn('[InsightService] Vector search failed:', error);
        selectedArticles = allArticles.slice(0, targetCount);
      }
    } else {
      // 没有设置兴趣，直接取最近的
      selectedArticles = allArticles.slice(0, targetCount);
    }
    
    // 4. 构建简化的 LLM Prompt - 只返回推荐 ID
    const articlesContext = selectedArticles.map((a, index) => 
      `[${index + 1}] Title: ${a.title}\n  ID: ${a.id}\n  Date: ${a.publish_date || a.created_at}\n  Summary: ${(a.summary || '').substring(0, 200)}...`
    ).join('\n\n');
    
    const interestsContext = interests.length > 0 
      ? `用户研究兴趣: ${interests.join(', ')}\n\n` 
      : '';

    const prompt = `
${interestsContext}以下是最近24小时收集的学术文献（共 ${selectedArticles.length} 篇）:

${articlesContext}

请用中文回答以下问题：

1. 用一段话（100-150字）总结今日文献的主要研究主题和趋势。
2. 从以上文献中推荐 ${targetCount} 篇最值得阅读的文章，只返回它们的序号（1-${selectedArticles.length}），用逗号分隔。

请严格按照以下JSON格式返回：
{
  "summary": "这里用中文写总结...",
  "recommended_indices": [1, 3, 5, 7, 9]
}

注意：
- 必须用中文回答
- recommended_indices 必须是 1 到 ${selectedArticles.length} 之间的整数
- 不要返回其他内容，只返回 JSON
    `;

    try {
      const response = await llmService.chat('insight', [{ role: 'user', content: prompt }]);
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        throw new Error('LLM 响应格式错误，无法解析 JSON');
      }
      
      const data = JSON.parse(jsonMatch[0]);
      
      // 解析推荐的文章 ID
      const recommendedIndices = Array.isArray(data.recommended_indices) 
        ? data.recommended_indices.map((i: any) => parseInt(i) - 1).filter((i: number) => i >= 0 && i < selectedArticles.length)
        : [];
      
      const recommendations = recommendedIndices.map((index: number) => {
        const article = selectedArticles[index];
        return {
          id: article.id,
          title: article.title,
          url: article.url,
          abstract: article.summary || '',
          date: article.publish_date || article.created_at,
          author: article.author || '未知'
        };
      });
      
      // Save to DB
      const date = new Date().toISOString().split('T')[0];
      db.prepare(`
        INSERT INTO daily_insights (date, summary_text, recommendations_json)
        VALUES (?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET summary_text = excluded.summary_text, recommendations_json = excluded.recommendations_json
      `).run(date, data.summary, JSON.stringify(recommendations));

      eventBus.emit('insight:generated', { type: 'daily', content: data.summary });
      console.log('[InsightService] Daily insight generated successfully');
    } catch (error) {
      console.error('[InsightService] Failed to generate daily insight:', error);
      throw error;
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
    console.log('[InsightService] generateSmartExtraction called with params:', params);
    
    try {
      // 获取用户设置的推荐数量
      const targetCount = Math.min(Math.max(parseInt(params.count) || 15, 5), 50);
      
      // 1. 处理 interests 参数
      let interests: string[] = [];
      if (params.interests) {
        if (Array.isArray(params.interests)) {
          interests = params.interests;
        } else if (typeof params.interests === 'string') {
          try {
            const parsed = JSON.parse(params.interests);
            interests = Array.isArray(parsed) ? parsed : [];
          } catch {
            interests = [];
          }
        }
      }
      
      // 如果没有 interests，回退到全局配置
      if (interests.length === 0) {
        interests = this.getUserResearchPreferences('topic');
      }
      
      // 2. 构建 SQL 查询条件
      let query = 'SELECT * FROM articles WHERE 1=1';
      const queryParams: any[] = [];
      
      if (params.startDate) {
        query += ' AND (publish_date >= ? OR created_at >= ?)';
        queryParams.push(params.startDate, params.startDate);
      }
      if (params.endDate) {
        query += ' AND (publish_date <= ? OR created_at <= ?)';
        queryParams.push(params.endDate, params.endDate);
      }
      
      if (params.sources && Array.isArray(params.sources) && params.sources.length > 0) {
        const placeholders = params.sources.map(() => '?').join(',');
        query += ` AND feed_id IN (${placeholders})`;
        queryParams.push(...params.sources);
      }
      
      query += ' ORDER BY created_at DESC';
      
      // 3. 获取符合条件的文章
      const allArticles = db.prepare(query).all(...queryParams) as any[];
      console.log(`[InsightService] Found ${allArticles.length} articles matching criteria`);
      
      let selectedArticles: any[] = [];
      
      // 4. 使用向量搜索进行精确筛选
      if (interests.length > 0 && allArticles.length > 0) {
        console.log('[InsightService] Using vector search with interests:', interests);
        const searchQuery = interests.join(' ');
        
        try {
          // 搜索更多结果以确保有足够的文章
          const searchResults = await vectorService.search(searchQuery, targetCount * 3);
          const relevantIds = new Set(searchResults.map((r: any) => r.id));
          
          // 优先选择相关度高的文章
          const relevantArticles = allArticles.filter(a => relevantIds.has(a.id));
          const otherArticles = allArticles.filter(a => !relevantIds.has(a.id));
          
          // 按相关度排序后取 targetCount 篇
          selectedArticles = relevantArticles.slice(0, targetCount);
          
          // 如果不够，补充不相关的文章
          if (selectedArticles.length < targetCount) {
            const remaining = targetCount - selectedArticles.length;
            selectedArticles = [...selectedArticles, ...otherArticles.slice(0, remaining)];
          }
          
          console.log(`[InsightService] Selected ${selectedArticles.length} articles by vector search`);
        } catch (error) {
          console.warn('[InsightService] Vector search failed, falling back to SQL:', error);
          // 回退到 SQL 查询
          selectedArticles = allArticles.slice(0, targetCount);
        }
      } else {
        // 没有设置兴趣，直接取最近的
        selectedArticles = allArticles.slice(0, targetCount);
      }
      
      if (selectedArticles.length === 0) {
        return {
          success: false,
          error: '未找到符合条件的文章'
        };
      }
      
      // 5. 构建简化的 LLM Prompt - 只返回推荐 ID
      const articlesContext = selectedArticles.map((a, index) => 
        `[${index + 1}] Title: ${a.title}\n  ID: ${a.id}\n  Date: ${a.publish_date || a.created_at}\n  Summary: ${(a.summary || '').substring(0, 200)}...`
      ).join('\n\n');
      
      const interestsContext = interests.length > 0 
        ? `用户研究兴趣: ${interests.join(', ')}\n\n` 
        : '';
      
      const dateRange = params.startDate && params.endDate 
        ? `时间范围: ${params.startDate} 至 ${params.endDate}\n` 
        : '';

      const prompt = `
${interestsContext}${dateRange}
以下是筛选出的学术文献（共 ${selectedArticles.length} 篇）:

${articlesContext}

请用中文回答以下问题：

1. 用一段话（100-150字）总结这个研究专题的主要内容和发现。
2. 从以上文献中推荐 ${targetCount} 篇最值得阅读的文章，只返回它们的序号（1-${selectedArticles.length}），用逗号分隔。

请严格按照以下JSON格式返回：
{
  "summary": "这里用中文写总结...",
  "recommended_indices": [1, 3, 5, 7, 9]
}

注意：
- 必须用中文回答
- recommended_indices 必须是 1 到 ${selectedArticles.length} 之间的整数
- 不要返回其他内容，只返回 JSON
      `;

      const response = await llmService.chat('insight', [{ role: 'user', content: prompt }]);
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        throw new Error('LLM 响应格式错误，无法解析 JSON');
      }
      
      const data = JSON.parse(jsonMatch[0]);
      
      // 解析推荐的文章 ID
      const recommendedIndices = Array.isArray(data.recommended_indices) 
        ? data.recommended_indices.map((i: any) => parseInt(i) - 1).filter((i: number) => i >= 0 && i < selectedArticles.length)
        : [];
      
      const recommendations = recommendedIndices.map((index: number) => {
        const article = selectedArticles[index];
        return {
          id: article.id,
          title: article.title,
          url: article.url,
          abstract: article.summary || '',
          date: article.publish_date || article.created_at,
          author: article.author || '未知'
        };
      });
      
      const title = params.title || `专题洞察 ${new Date().toLocaleDateString()}`;
      
      // 6. 保存到数据库
      const info = db.prepare(`
        INSERT INTO topic_insights (title, summary_text, recommendations_json, config_json)
        VALUES (?, ?, ?, ?)
      `).run(title, data.summary, JSON.stringify(recommendations), JSON.stringify(params));

      console.log('[InsightService] Smart extraction generated successfully');
      
      return {
        success: true,
        data: {
          id: Number(info.lastInsertRowid),
          title,
          summary: data.summary,
          recommendations: recommendations,
          // 同时保存原始文章列表供前端使用
          articles: selectedArticles.map(a => ({
            id: a.id,
            title: a.title,
            summary: a.summary,
            url: a.url,
            publish_date: a.publish_date,
            author: a.author
          }))
        }
      };
    } catch (error: any) {
      console.error('[InsightService] generateSmartExtraction error:', error);
      return {
        success: false,
        error: error.message || '生成洞察失败'
      };
    }
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

  async rerunDailyInsight(targetCount: number = 10): Promise<void> {
    console.log('[InsightService] rerunDailyInsight called with targetCount:', targetCount);
    
    // 1. 获取每日洞察的专属研究偏好
    const interests = this.getUserResearchPreferences('daily');
    console.log('[InsightService] rerunDailyInsight interests:', interests);
    
    // 2. SQL 查询最近 24h 的全部文章
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const allArticles = db.prepare('SELECT * FROM articles WHERE created_at > ? ORDER BY created_at DESC').all(oneDayAgo) as any[];
    console.log('[InsightService] rerunDailyInsight allArticles count:', allArticles.length);
    
    if (allArticles.length === 0) {
      console.log('[InsightService] No articles found for rerun');
      return;
    }
    
    let selectedArticles: any[] = [];
    
    // 3. 使用向量搜索进行排序/筛选
    console.log('[InsightService] rerunDailyInsight checking interests.length:', interests.length);
    if (interests.length > 0) {
      console.log('[InsightService] rerunDailyInsight: Using vector search with interests:', interests);
      const searchQuery = interests.join(' ');
      console.log('[InsightService] rerunDailyInsight: searchQuery:', searchQuery);
      
      try {
        console.log('[InsightService] rerunDailyInsight: Calling vectorService.search...');
        const searchResults = await vectorService.search(searchQuery, targetCount * 3);
        console.log('[InsightService] rerunDailyInsight: searchResults:', searchResults);
        const relevantIds = new Set(searchResults.map((r: any) => r.id));
        console.log('[InsightService] rerunDailyInsight: relevantIds count:', relevantIds.size);
        
        const relevantArticles = allArticles.filter(a => relevantIds.has(a.id));
        const otherArticles = allArticles.filter(a => !relevantIds.has(a.id));
        console.log('[InsightService] rerunDailyInsight: relevantArticles:', relevantArticles.length, 'otherArticles:', otherArticles.length);
        
        selectedArticles = relevantArticles.slice(0, targetCount);
        console.log('[InsightService] rerunDailyInsight: selectedArticles after relevant filter:', selectedArticles.length);
        
        if (selectedArticles.length < targetCount) {
          const remaining = targetCount - selectedArticles.length;
          selectedArticles = [...selectedArticles, ...otherArticles.slice(0, remaining)];
          console.log('[InsightService] rerunDailyInsight: selectedArticles after补充:', selectedArticles.length);
        }
      } catch (error) {
        console.warn('[InsightService] rerunDailyInsight: Vector search failed:', error);
        selectedArticles = allArticles.slice(0, targetCount);
        console.log('[InsightService] rerunDailyInsight: Fallback to recent articles');
      }
    } else {
      console.log('[InsightService] rerunDailyInsight: No interests, using recent articles');
      selectedArticles = allArticles.slice(0, targetCount);
    }
    
    console.log('[InsightService] rerunDailyInsight: Final selectedArticles count:', selectedArticles.length);
    
    // 4. 构建简化的 LLM Prompt
    const articlesContext = selectedArticles.map((a, index) => 
      `[${index + 1}] Title: ${a.title}\n  ID: ${a.id}\n  Date: ${a.publish_date || a.created_at}\n  Summary: ${(a.summary || '').substring(0, 200)}...`
    ).join('\n\n');
    
    const interestsContext = interests.length > 0 
      ? `用户研究兴趣: ${interests.join(', ')}\n\n` 
      : '';

    const prompt = `
${interestsContext}以下是最近24小时收集的学术文献（共 ${selectedArticles.length} 篇）:

${articlesContext}

请用中文回答以下问题：

1. 用一段话（100-150字）总结今日文献的主要研究主题和趋势。
2. 从以上文献中推荐 ${targetCount} 篇最值得阅读的文章，只返回它们的序号（1-${selectedArticles.length}），用逗号分隔。

请严格按照以下JSON格式返回：
{
  "summary": "这里用中文写总结...",
  "recommended_indices": [1, 3, 5, 7, 9]
}

注意：
- 必须用中文回答
- recommended_indices 必须是 1 到 ${selectedArticles.length} 之间的整数
- 不要返回其他内容，只返回 JSON
    `;

    try {
      const response = await llmService.chat('insight', [{ role: 'user', content: prompt }]);
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        throw new Error('LLM 响应格式错误，无法解析 JSON');
      }
      
      const data = JSON.parse(jsonMatch[0]);
      
      const recommendedIndices = Array.isArray(data.recommended_indices) 
        ? data.recommended_indices.map((i: any) => parseInt(i) - 1).filter((i: number) => i >= 0 && i < selectedArticles.length)
        : [];
      
      const recommendations = recommendedIndices.map((index: number) => {
        const article = selectedArticles[index];
        return {
          id: article.id,
          title: article.title,
          url: article.url,
          abstract: article.summary || '',
          date: article.publish_date || article.created_at,
          author: article.author || '未知'
        };
      });
      
      const date = new Date().toISOString().split('T')[0];
      db.prepare(`
        INSERT INTO daily_insights (date, summary_text, recommendations_json)
        VALUES (?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET summary_text = excluded.summary_text, recommendations_json = excluded.recommendations_json
      `).run(date, data.summary, JSON.stringify(recommendations));
      
      eventBus.emit('insight:generated', { type: 'daily', content: data.summary });
      console.log('[InsightService] Daily insight rerun successfully');
    } catch (error) {
      console.error('Failed to rerun daily insight:', error);
      throw error;
    }
  }
}

export const insightService = new InsightService();
