import { EventEmitter } from 'events';

// 定义事件类型映射
export interface AppEventMap {
  // 系统级事件
  'app:ready': void;
  'app:quit': void;

  // 配置/模型事件
  'config:updated': void;
  'model:updated': void;

  // 数据源事件
  'source:update-start': void;
  'source:update-progress': { current: number; total: number; message?: string };
  'source:update-complete': void;
  'feed:fetch-start': { feedId: number; url: string };
  'feed:fetch-success': { feedId: number; newArticlesCount: number };
  'feed:fetch-error': { feedId: number; error: string };

  // 文章事件
  'article:discovered': { url: string; title: string; feedId: number }; // 发现新文章（尚未入库）
  'article:created': { id: number; title: string }; // 新文章已入库
  'article:updated': { id: number; changes: Record<string, any> };
  'article:deleted': { id: number };

  // 处理流事件
  'embedding:queued': { articleId: number };
  'embedding:success': { articleId: number };
  'embedding:error': { articleId: number; error: string };
  'insight:generated': { type: string; content: string };
}

class TypedEventEmitter extends EventEmitter {
  emit<K extends keyof AppEventMap>(event: K, payload?: AppEventMap[K]): boolean {
    return super.emit(event, payload);
  }

  on<K extends keyof AppEventMap>(event: K, listener: (payload: AppEventMap[K]) => void): this {
    return super.on(event, listener);
  }

  once<K extends keyof AppEventMap>(event: K, listener: (payload: AppEventMap[K]) => void): this {
    return super.once(event, listener);
  }

  off<K extends keyof AppEventMap>(event: K, listener: (payload: AppEventMap[K]) => void): this {
    return super.off(event, listener);
  }
}

export const eventBus = new TypedEventEmitter();