import Database from 'better-sqlite3';
import * as lancedb from '@lancedb/lancedb';
import path from 'path';
import { app } from 'electron';

const isDev = !app.isPackaged;
const dbPath = isDev 
  ? path.join(process.cwd(), 'database.db')
  : path.join(app.getPath('userData'), 'database.db');

const lancePath = isDev
  ? path.join(process.cwd(), 'lancedb')
  : path.join(app.getPath('userData'), 'lancedb');

export const db = new Database(dbPath);

// Initialize SQLite tables
export function initSqlite() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      llm_base_url TEXT,
      llm_api_key TEXT,
      llm_model_name TEXT,
      embedding_model_name TEXT,
      rerank_model_name TEXT,
      proxy_url TEXT,
      user_preferences TEXT,
      translation_enabled BOOLEAN DEFAULT 0,
      translation_mode TEXT DEFAULT 'append' -- 'append' or 'replace'
    );

    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rss_feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT UNIQUE NOT NULL,
      parsing_script TEXT NOT NULL,
      proxy_override TEXT,
      cron_schedule TEXT NOT NULL,
      last_fetch_status TEXT,
      group_id INTEGER,
      FOREIGN KEY (group_id) REFERENCES groups(id)
    );

    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rss_feed_id INTEGER,
      title TEXT,
      authors TEXT,
      abstract TEXT,
      publication_date TEXT,
      url TEXT UNIQUE,
      doi TEXT,
      journal_info TEXT,
      is_favorited BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      read_duration_seconds INTEGER DEFAULT 0,
      favorited_at DATETIME,
      trans_title TEXT,
      trans_abstract TEXT,
      FOREIGN KEY (rss_feed_id) REFERENCES rss_feeds(id)
    );

    CREATE TABLE IF NOT EXISTS daily_insights (
      date TEXT PRIMARY KEY,
      summary_text TEXT,
      recommendations_json TEXT
    );

    CREATE TABLE IF NOT EXISTS token_usage (
      date TEXT PRIMARY KEY,
      tokens_used INTEGER
    );

    CREATE TABLE IF NOT EXISTS chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      messages TEXT, -- JSON string
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Insert default settings if not exists
    INSERT OR IGNORE INTO settings (id) VALUES (1);
  `);

  // Migrations: Add columns if they don't exist
  const tableInfoArticles = db.prepare("PRAGMA table_info(articles)").all() as any[];
  const hasTransTitle = tableInfoArticles.some(c => c.name === 'trans_title');
  if (!hasTransTitle) {
    db.exec("ALTER TABLE articles ADD COLUMN trans_title TEXT");
    db.exec("ALTER TABLE articles ADD COLUMN trans_abstract TEXT");
  }

  const tableInfoSettings = db.prepare("PRAGMA table_info(settings)").all() as any[];
  const hasTransEnabled = tableInfoSettings.some(c => c.name === 'translation_enabled');
  if (!hasTransEnabled) {
    db.exec("ALTER TABLE settings ADD COLUMN translation_enabled BOOLEAN DEFAULT 0");
    db.exec("ALTER TABLE settings ADD COLUMN translation_mode TEXT DEFAULT 'append'");
  }
  
  const hasTransModel = tableInfoSettings.some(c => c.name === 'trans_llm_model_name');
  if (!hasTransModel) {
    db.exec("ALTER TABLE settings ADD COLUMN trans_llm_base_url TEXT");
    db.exec("ALTER TABLE settings ADD COLUMN trans_llm_api_key TEXT");
    db.exec("ALTER TABLE settings ADD COLUMN trans_llm_model_name TEXT");
  }

  const tableInfoFeeds = db.prepare("PRAGMA table_info(rss_feeds)").all() as any[];
  const hasUpdateInterval = tableInfoFeeds.some(c => c.name === 'update_interval');
  if (!hasUpdateInterval) {
    db.exec("ALTER TABLE rss_feeds ADD COLUMN update_interval INTEGER DEFAULT 24");
  }
}

export async function initLanceDB() {
  const conn = await lancedb.connect(lancePath);
  return conn;
}

export async function getArticlesTable() {
  const conn = await initLanceDB();
  try {
    return await conn.openTable('articles');
  } catch {
    // Table doesn't exist, will be created when first data is added
    return null;
  }
}
