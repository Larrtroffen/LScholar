import Database from 'better-sqlite3';
import * as lancedb from '@lancedb/lancedb';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';

const isDev = !app.isPackaged;

// 开发环境数据目录
const devDataDir = path.join(process.cwd(), '.dev-data');

// 确保开发环境数据目录存在
if (isDev && !fs.existsSync(devDataDir)) {
  fs.mkdirSync(devDataDir, { recursive: true });
}

// 数据库路径配置
const dbPath = isDev 
  ? path.join(devDataDir, 'database.db')
  : path.join(app.getPath('userData'), 'database.db');

const lancePath = isDev
  ? path.join(devDataDir, 'lancedb')
  : path.join(app.getPath('userData'), 'lancedb');

// 输出调试信息
console.log('='.repeat(60));
console.log('📊 数据库初始化信息');
console.log('='.repeat(60));
console.log(`运行模式: ${isDev ? '开发环境' : '生产环境'}`);
console.log(`SQLite 数据库路径: ${dbPath}`);
console.log(`LanceDB 数据库路径: ${lancePath}`);
console.log('='.repeat(60));

export const db = new Database(dbPath);

// Initialize SQLite tables
export function initSqlite() {
  console.log('🔧 正在初始化 SQLite 数据库表...');
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      provider TEXT NOT NULL, -- 'openai', 'ollama', 'local', 'custom'
      base_url TEXT,
      api_key TEXT,
      model_name TEXT NOT NULL,
      type TEXT NOT NULL, -- 'llm', 'embedding'
      proxy_url TEXT,
      context_window INTEGER,
      is_built_in BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS model_assignments (
      function_type TEXT PRIMARY KEY, -- 'main_chat', 'embedding', 'translation', 'insight', 'script_generation'
      model_id INTEGER,
      FOREIGN KEY (model_id) REFERENCES ai_models(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      theme TEXT DEFAULT 'system', -- 'light', 'dark', 'system'
      language TEXT DEFAULT 'zh-CN', -- 'zh-CN', 'en-US'
      auto_update_on_launch BOOLEAN DEFAULT 1,
      max_concurrent_tasks INTEGER DEFAULT 2,
      user_preferences TEXT -- JSON string for other prefs
    );

    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rss_feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT UNIQUE NOT NULL,
      parsing_script TEXT, -- AI generated parsing script
      proxy_override TEXT,
      last_updated DATETIME,
      error_count INTEGER DEFAULT 0,
      group_id INTEGER,
      FOREIGN KEY (group_id) REFERENCES groups(id)
    );

    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feed_id INTEGER,
      title TEXT,
      url TEXT UNIQUE,
      content TEXT,
      summary TEXT,
      publish_date TEXT,
      author TEXT,
      is_read BOOLEAN DEFAULT 0,
      is_favorite BOOLEAN DEFAULT 0,
      embedding_status TEXT DEFAULT 'none', -- 'none', 'pending', 'completed', 'failed'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (feed_id) REFERENCES rss_feeds(id)
    );

    CREATE TABLE IF NOT EXISTS daily_insights (
      date TEXT PRIMARY KEY,
      summary_text TEXT,
      recommendations_json TEXT
    );

    CREATE TABLE IF NOT EXISTS chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      messages TEXT, -- JSON string
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS topic_insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      summary_text TEXT,
      recommendations_json TEXT,
      config_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Insert default settings if not exists
    INSERT OR IGNORE INTO settings (id) VALUES (1);
  `);

  // Migrations
  migrateDatabase();
  
  console.log('✅ SQLite 数据库初始化完成');
}

function migrateDatabase() {
  console.log('📝 检查数据库迁移...');
  
  // 1. settings 表迁移
  const tableInfoSettings = db.prepare("PRAGMA table_info(settings)").all() as any[];
  const settingsColumns = tableInfoSettings.map(c => c.name);
  
  if (!settingsColumns.includes('theme')) {
    console.log('Migrating settings: adding theme');
    db.exec("ALTER TABLE settings ADD COLUMN theme TEXT DEFAULT 'system'");
  }
  if (!settingsColumns.includes('language')) {
    console.log('Migrating settings: adding language');
    db.exec("ALTER TABLE settings ADD COLUMN language TEXT DEFAULT 'zh-CN'");
  }
  if (!settingsColumns.includes('auto_update_on_launch')) {
    console.log('Migrating settings: adding auto_update_on_launch');
    db.exec("ALTER TABLE settings ADD COLUMN auto_update_on_launch BOOLEAN DEFAULT 1");
  }
  if (!settingsColumns.includes('max_concurrent_tasks')) {
    console.log('Migrating settings: adding max_concurrent_tasks');
    db.exec("ALTER TABLE settings ADD COLUMN max_concurrent_tasks INTEGER DEFAULT 2");
  }

  // 2. ai_models 表迁移
  const tableInfoModels = db.prepare("PRAGMA table_info(ai_models)").all() as any[];
  const modelColumns = tableInfoModels.map(c => c.name);
  
  if (!modelColumns.includes('context_window')) {
    console.log('Migrating ai_models: adding context_window');
    db.exec("ALTER TABLE ai_models ADD COLUMN context_window INTEGER");
  }
  if (!modelColumns.includes('is_built_in')) {
    console.log('Migrating ai_models: adding is_built_in');
    db.exec("ALTER TABLE ai_models ADD COLUMN is_built_in BOOLEAN DEFAULT 0");
  }

  // 3. rss_feeds 表迁移
  const tableInfoFeeds = db.prepare("PRAGMA table_info(rss_feeds)").all() as any[];
  const feedColumns = tableInfoFeeds.map(c => c.name);
  
  if (!feedColumns.includes('parsing_script')) {
    console.log('Migrating rss_feeds: adding parsing_script');
    db.exec("ALTER TABLE rss_feeds ADD COLUMN parsing_script TEXT");
  }
  if (!feedColumns.includes('error_count')) {
    console.log('Migrating rss_feeds: adding error_count');
    db.exec("ALTER TABLE rss_feeds ADD COLUMN error_count INTEGER DEFAULT 0");
  }
  if (!feedColumns.includes('update_interval')) {
    console.log('Migrating rss_feeds: adding update_interval');
    db.exec("ALTER TABLE rss_feeds ADD COLUMN update_interval INTEGER DEFAULT 24");
  }
  if (!feedColumns.includes('cron_schedule')) {
    console.log('Migrating rss_feeds: adding cron_schedule');
    db.exec("ALTER TABLE rss_feeds ADD COLUMN cron_schedule TEXT DEFAULT '0 0 * * *'");
  }

  // 4. articles 表迁移
  const tableInfoArticles = db.prepare("PRAGMA table_info(articles)").all() as any[];
  const articleColumns = tableInfoArticles.map(c => c.name);
  
  if (!articleColumns.includes('embedding_status')) {
    console.log('Migrating articles: adding embedding_status');
    db.exec("ALTER TABLE articles ADD COLUMN embedding_status TEXT DEFAULT 'none'");
    // Migrate old is_embedded boolean if exists
    if (articleColumns.includes('is_embedded')) {
      db.exec("UPDATE articles SET embedding_status = 'completed' WHERE is_embedded = 1");
    }
  }
  
  // Rename rss_feed_id to feed_id if needed (or just use feed_id in new code and keep rss_feed_id in DB if we want to avoid complex migration)
  // For now, let's stick to the schema definition. If rss_feed_id exists, we might want to alias it or migrate it.
  // To keep it simple, we'll assume we can use rss_feed_id as feed_id in the code or migrate it properly.
  // Let's check if feed_id exists, if not and rss_feed_id exists, we might need to handle it.
  if (!articleColumns.includes('feed_id') && articleColumns.includes('rss_feed_id')) {
     console.log('Migrating articles: renaming rss_feed_id to feed_id (via new column and copy)');
     db.exec("ALTER TABLE articles ADD COLUMN feed_id INTEGER REFERENCES rss_feeds(id)");
     db.exec("UPDATE articles SET feed_id = rss_feed_id");
  }

  // 5. articles 表翻译字段迁移
  if (!articleColumns.includes('trans_title')) {
    console.log('Migrating articles: adding trans_title');
    db.exec("ALTER TABLE articles ADD COLUMN trans_title TEXT");
  }
  if (!articleColumns.includes('trans_abstract')) {
    console.log('Migrating articles: adding trans_abstract');
    db.exec("ALTER TABLE articles ADD COLUMN trans_abstract TEXT");
  }
}

// LanceDB connection caching
let lanceConn: lancedb.Connection | null = null;

export async function initLanceDB() {
  console.log('🔧 正在初始化 LanceDB 向量数据库...');
  const conn = await lancedb.connect(lancePath);
  console.log('✅ LanceDB 初始化完成');
  return conn;
}

export async function getLanceConnection(): Promise<lancedb.Connection> {
  if (!lanceConn) {
    lanceConn = await lancedb.connect(lancePath);
  }
  return lanceConn;
}

export async function getArticlesTable() {
  console.log('[VectorService] getArticlesTable called');
  try {
    const conn = await getLanceConnection();
    console.log('[VectorService] LanceDB connection obtained');
    const table = await conn.openTable('articles');
    console.log('[VectorService] Articles table opened successfully');
    return table;
  } catch (error) {
    console.warn('[VectorService] Articles table does not exist or error:', error);
    return null;
  }
}
