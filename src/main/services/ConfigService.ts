import { db } from '../db';
import { eventBus } from '../events';
import { AppSettings, ModelAssignment, FunctionType } from '../../shared/types';

export class ConfigService {
  constructor() {
    // Initialization moved to explicit method to ensure DB is ready
  }

  initialize() {
    // Ensure default settings exist
    try {
      const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
      if (!settings) {
        db.prepare('INSERT INTO settings (id) VALUES (1)').run();
        console.log('[ConfigService] Initialized default settings');
      } else {
        console.log('[ConfigService] Settings already initialized');
      }
    } catch (error) {
      console.error('[ConfigService] Failed to initialize:', error);
      throw new Error('Failed to initialize configuration service');
    }
  }

  getSettings(): AppSettings {
    try {
      const row = db.prepare('SELECT * FROM settings WHERE id = 1').get() as any;
      if (!row) {
        console.warn('[ConfigService] Settings not found, returning defaults');
        return {
          id: 1,
          theme: 'system',
          language: 'zh-CN',
          auto_update_on_launch: true,
          max_concurrent_tasks: 2,
          user_preferences: ''
        };
      }
      return {
        id: row.id,
        theme: row.theme || 'system',
        language: row.language || 'zh-CN',
        auto_update_on_launch: Boolean(row.auto_update_on_launch),
        max_concurrent_tasks: row.max_concurrent_tasks || 2,
        user_preferences: row.user_preferences || ''
      };
    } catch (error) {
      console.error('[ConfigService] Failed to get settings:', error);
      throw new Error('Failed to retrieve settings');
    }
  }

  updateSettings(settings: Partial<AppSettings>): AppSettings {
    try {
      const current = this.getSettings();
      const updated = { ...current, ...settings };
      
      const sets: string[] = [];
      const values: any[] = [];

      if (settings.theme !== undefined) {
        sets.push('theme = ?');
        values.push(settings.theme);
      }
      if (settings.language !== undefined) {
        sets.push('language = ?');
        values.push(settings.language);
      }
      if (settings.auto_update_on_launch !== undefined) {
        sets.push('auto_update_on_launch = ?');
        values.push(settings.auto_update_on_launch ? 1 : 0);
      }
      if (settings.max_concurrent_tasks !== undefined) {
        sets.push('max_concurrent_tasks = ?');
        values.push(settings.max_concurrent_tasks);
      }
      if (settings.user_preferences !== undefined) {
        sets.push('user_preferences = ?');
        values.push(settings.user_preferences);
      }

      if (sets.length > 0) {
        db.prepare(`UPDATE settings SET ${sets.join(', ')} WHERE id = 1`).run(...values);
        eventBus.emit('config:updated');
      }

      return this.getSettings();
    } catch (error) {
      console.error('[ConfigService] Failed to update settings:', error);
      throw new Error('Failed to update settings');
    }
  }

  getAssignment(functionType: FunctionType): ModelAssignment | null {
    try {
      const row = db.prepare('SELECT * FROM model_assignments WHERE function_type = ?').get(functionType) as any;
      if (!row) {
        return null;
      }
      return {
        function_type: row.function_type,
        model_id: row.model_id
      };
    } catch (error) {
      console.error(`[ConfigService] Failed to get assignment for ${functionType}:`, error);
      return null;
    }
  }

  setAssignment(functionType: FunctionType, modelId: number | null): void {
    console.log('[ConfigService] setAssignment called:', { functionType, modelId, typeof: typeof modelId });
    
    try {
      // 验证 modelId（只接受 null 或数字）
      if (modelId !== null && (typeof modelId !== 'number' || isNaN(modelId))) {
        console.warn('[ConfigService] Invalid modelId, ignoring:', modelId);
        return; // Silent fail，不抛出错误
      }

      // 检查数据库中的现有记录
      const existing = db.prepare('SELECT * FROM model_assignments WHERE function_type = ?').get(functionType) as any;
      console.log('[ConfigService] Existing record:', existing);
      
      if (modelId === null) {
        // 如果 modelId 为 null，删除该分配记录
        if (existing) {
          const result = db.prepare('DELETE FROM model_assignments WHERE function_type = ?').run(functionType);
          console.log('[ConfigService] Deleted assignment, changes:', result.changes);
        } else {
          console.log('[ConfigService] No assignment to delete');
        }
      } else {
        // 否则更新或插入记录
        if (existing) {
          const result = db.prepare('UPDATE model_assignments SET model_id = ? WHERE function_type = ?').run(modelId, functionType);
          console.log('[ConfigService] Updated assignment, changes:', result.changes);
        } else {
          const result = db.prepare('INSERT INTO model_assignments (function_type, model_id) VALUES (?, ?)').run(functionType, modelId);
          console.log('[ConfigService] Inserted assignment, changes:', result.changes);
        }
      }
      
      // 验证保存结果
      const verify = db.prepare('SELECT * FROM model_assignments WHERE function_type = ?').get(functionType);
      console.log('[ConfigService] Verification result:', verify);
      
      eventBus.emit('config:updated');
      console.log('[ConfigService] config:updated event emitted');
    } catch (error: any) {
      console.error('[ConfigService] Exception in setAssignment:', error);
      throw new Error(`Failed to set assignment for ${functionType}: ${error.message}`);
    }
  }

  getAllAssignments(): ModelAssignment[] {
    try {
      const rawRows = db.prepare('SELECT * FROM model_assignments').all() as any[];
      console.log('[ConfigService] Raw DB rows:', rawRows);
      
      const assignments = rawRows.map(row => ({
        function_type: row.function_type,
        model_id: row.model_id
      }));
      
      // 确保所有功能类型都有记录
      const allFunctionTypes: FunctionType[] = ['main_chat', 'embedding', 'translation', 'insight', 'script_generation'];
      const result: ModelAssignment[] = [];
      
      for (const type of allFunctionTypes) {
        const existing = assignments.find(a => a.function_type === type);
        result.push(existing || { function_type: type, model_id: null });
      }
      
      console.log('[ConfigService] Final assignments:', result);
      return result;
    } catch (error) {
      console.error('[ConfigService] Failed to get all assignments:', error);
      // 返回默认空分配而不是抛出错误
      const allFunctionTypes: FunctionType[] = ['main_chat', 'embedding', 'translation', 'insight', 'script_generation'];
      return allFunctionTypes.map(type => ({ function_type: type, model_id: null }));
    }
  }
}

export const configService = new ConfigService();
