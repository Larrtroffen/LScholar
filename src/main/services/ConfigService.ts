import { db } from '../db';
import { eventBus } from '../events';
import { AppSettings, ModelAssignment, FunctionType } from '../../shared/types';

// 日志工具函数
const log = {
  info: (message: string, data?: any) => {
    console.log(`[ConfigService] ${message}`, data || '');
  },
  error: (message: string, error: any) => {
    console.error(`[ConfigService] ${message}`, error);
  },
  warn: (message: string, data?: any) => {
    console.warn(`[ConfigService] ${message}`, data || '');
  }
};

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
        log.info('Initialized default settings');
      } else {
        log.info('Settings already initialized');
      }
    } catch (error) {
      log.error('Failed to initialize ConfigService:', error);
      throw new Error('Failed to initialize configuration service');
    }
  }

  getSettings(): AppSettings {
    try {
      const row = db.prepare('SELECT * FROM settings WHERE id = 1').get() as any;
      if (!row) {
        log.warn('Settings not found, returning defaults');
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
      log.error('Failed to get settings:', error);
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
        // log.info('Settings updated', { updated }); // 关闭刷屏日志
        eventBus.emit('config:updated');
      }

      return this.getSettings();
    } catch (error) {
      log.error('Failed to update settings:', error);
      throw new Error('Failed to update settings');
    }
  }

  getAssignment(functionType: FunctionType): ModelAssignment | null {
    try {
      const row = db.prepare('SELECT * FROM model_assignments WHERE function_type = ?').get(functionType) as any;
      if (!row) {
        log.info(`No assignment found for function type: ${functionType}`);
        return null;
      }
      return {
        function_type: row.function_type,
        model_id: row.model_id
      };
    } catch (error) {
      log.error(`Failed to get assignment for ${functionType}:`, error);
      return null;
    }
  }

  setAssignment(functionType: FunctionType, modelId: number | null): void {
    try {
      const existing = db.prepare('SELECT function_type FROM model_assignments WHERE function_type = ?').get(functionType);
      
      if (modelId === null) {
        // 如果 modelId 为 null，删除该分配记录
        if (existing) {
          db.prepare('DELETE FROM model_assignments WHERE function_type = ?').run(functionType);
          log.info(`Removed assignment for ${functionType}`);
        } else {
          log.info(`No assignment to remove for ${functionType}`);
        }
      } else {
        // 否则更新或插入记录
        if (existing) {
          db.prepare('UPDATE model_assignments SET model_id = ? WHERE function_type = ?').run(modelId, functionType);
          log.info(`Updated assignment for ${functionType}`, { modelId });
        } else {
          db.prepare('INSERT INTO model_assignments (function_type, model_id) VALUES (?, ?)').run(functionType, modelId);
          log.info(`Created assignment for ${functionType}`, { modelId });
        }
      }
      eventBus.emit('config:updated');
    } catch (error) {
      log.error(`Failed to set assignment for ${functionType}:`, error);
      throw new Error(`Failed to set assignment for ${functionType}`);
    }
  }

  getAllAssignments(): ModelAssignment[] {
    try {
      const rows = db.prepare('SELECT * FROM model_assignments').all() as any[];
      const assignments = rows.map(row => ({
        function_type: row.function_type,
        model_id: row.model_id
      }));
      
      // 确保所有功能类型都有记录，即使没有分配模型
      const allFunctionTypes: FunctionType[] = ['main_chat', 'embedding', 'translation', 'insight', 'script_generation'];
      const result: ModelAssignment[] = [];
      
      for (const type of allFunctionTypes) {
        const existing = assignments.find(a => a.function_type === type);
        result.push(existing || { function_type: type, model_id: null });
      }
      
      log.info(`Retrieved ${result.length} assignments`);
      return result;
    } catch (error) {
      log.error('Failed to get all assignments:', error);
      return [];
    }
  }
}

export const configService = new ConfigService();
