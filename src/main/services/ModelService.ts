import { db } from '../db';
import { eventBus } from '../events';
import { AIModel } from '../../shared/types';
import OpenAI from 'openai';

export class ModelService {
  getAll(): AIModel[] {
    const rows = db.prepare('SELECT * FROM ai_models').all() as any[];
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      provider: row.provider,
      base_url: row.base_url,
      api_key: row.api_key,
      model_name: row.model_name,
      type: row.type,
      proxy_url: row.proxy_url,
      context_window: row.context_window,
      is_built_in: Boolean(row.is_built_in)
    }));
  }

  getById(id: number): AIModel | undefined {
    const row = db.prepare('SELECT * FROM ai_models WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    return {
      id: row.id,
      name: row.name,
      provider: row.provider,
      base_url: row.base_url,
      api_key: row.api_key,
      model_name: row.model_name,
      type: row.type,
      proxy_url: row.proxy_url,
      context_window: row.context_window,
      is_built_in: Boolean(row.is_built_in)
    };
  }

  add(model: Omit<AIModel, 'id'>): AIModel {
    const stmt = db.prepare(`
      INSERT INTO ai_models (name, provider, base_url, api_key, model_name, type, proxy_url, context_window, is_built_in)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const info = stmt.run(
      model.name,
      model.provider,
      model.base_url,
      model.api_key,
      model.model_name,
      model.type,
      model.proxy_url,
      model.context_window,
      model.is_built_in ? 1 : 0
    );

    eventBus.emit('model:updated');
    return { ...model, id: Number(info.lastInsertRowid) };
  }

  update(id: number, model: Partial<AIModel>): void {
    const sets: string[] = [];
    const values: any[] = [];

    if (model.name !== undefined) { sets.push('name = ?'); values.push(model.name); }
    if (model.provider !== undefined) { sets.push('provider = ?'); values.push(model.provider); }
    if (model.base_url !== undefined) { sets.push('base_url = ?'); values.push(model.base_url); }
    if (model.api_key !== undefined) { sets.push('api_key = ?'); values.push(model.api_key); }
    if (model.model_name !== undefined) { sets.push('model_name = ?'); values.push(model.model_name); }
    if (model.type !== undefined) { sets.push('type = ?'); values.push(model.type); }
    if (model.proxy_url !== undefined) { sets.push('proxy_url = ?'); values.push(model.proxy_url); }
    if (model.context_window !== undefined) { sets.push('context_window = ?'); values.push(model.context_window); }
    if (model.is_built_in !== undefined) { sets.push('is_built_in = ?'); values.push(model.is_built_in ? 1 : 0); }

    if (sets.length > 0) {
      values.push(id);
      db.prepare(`UPDATE ai_models SET ${sets.join(', ')} WHERE id = ?`).run(...values);
      eventBus.emit('model:updated');
    }
  }

  delete(id: number): void {
    db.prepare('DELETE FROM ai_models WHERE id = ?').run(id);
    // Also remove from assignments
    db.prepare('DELETE FROM model_assignments WHERE model_id = ?').run(id);
    eventBus.emit('model:updated');
  }

  async testConnection(model: AIModel): Promise<boolean> {
    try {
      if (model.provider === 'openai' || model.provider === 'custom') {
        const openai = new OpenAI({
          baseURL: model.base_url,
          apiKey: model.api_key || 'dummy',
          dangerouslyAllowBrowser: true // Not needed in Node but good for safety
        });
        
        // Try to list models or make a simple completion
        await openai.models.list();
        return true;
      } else if (model.provider === 'ollama') {
        const response = await fetch(`${model.base_url}/api/tags`);
        return response.ok;
      }
      
      // For other providers or local, assume true for now or implement specific checks
      return true;
    } catch (error) {
      console.error('Model connection test failed:', error);
      return false;
    }
  }
}

export const modelService = new ModelService();
