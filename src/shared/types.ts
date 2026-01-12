// 数据库模型定义

export interface AppSettings {
  id?: number;
  theme: 'light' | 'dark' | 'system';
  language: 'zh-CN' | 'en-US';
  auto_update_on_launch: boolean;
  max_concurrent_tasks: number;
  user_preferences?: string; // JSON string for other prefs
}

export type ModelType = 'llm' | 'embedding';

export interface AIModel {
  id?: number;
  name: string;
  provider: 'openai' | 'ollama' | 'local' | 'custom';
  base_url: string;
  api_key?: string;
  model_name: string;
  type: ModelType;
  proxy_url?: string;
  context_window?: number;
  is_built_in: boolean;
}

export type FunctionType = 'main_chat' | 'embedding' | 'translation' | 'insight' | 'script_generation';

export interface ModelAssignment {
  function_type: FunctionType;
  model_id: number | null;
}

export interface FeedGroup {
  id?: number;
  name: string;
}

export interface RSSFeed {
  id?: number;
  name: string;
  url: string;
  group_id?: number;
  proxy_override?: string;
  parsing_script?: string; // AI generated parsing script
  last_updated?: string;
  error_count?: number;
  // UI fields
  last_fetch_status?: 'success' | 'failed';
  article_count?: number;
  update_interval?: number;
  cron_schedule?: string;
}

export interface Article {
  id?: number;
  feed_id: number;
  title: string;
  url: string;
  content?: string;
  summary?: string;
  publish_date?: string;
  author?: string;
  is_read: boolean;
  is_favorite: boolean;
  embedding_status: 'none' | 'pending' | 'completed' | 'failed';
  created_at?: string;
}

// IPC 接口定义
export interface IpcResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}