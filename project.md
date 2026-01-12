# LarRsScholar 项目业务链路文档

## 目录
- [项目架构概述](#项目架构概述)
- [数据模型](#数据模型)
- [IPC 接口清单](#ipc-接口清单)
- [服务层方法](#服务层方法)
- [前端 Store](#前端-store)
- [页面组件](#页面组件)
- [事件系统](#事件系统)
- [数据库表结构](#数据库表结构)
- [业务流程](#业务流程)

---

## 项目架构概述

```
┌─────────────────────────────────────────────────────────────────┐
│                        渲染进程 (Renderer)                       │
├─────────────────────────────────────────────────────────────────┤
│  Vue 3 + Pinia + Element Plus + Tailwind CSS                    │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Views     │  │   Store     │  │ Components  │              │
│  │ (页面组件)   │  │ (状态管理)  │  │ (通用组件)  │              │
│  └──────┬──────┘  └──────┬──────┘  └─────────────┘              │
│         │                │                                       │
│         └────────────────┼───────────────────────────────────────┤
│                          │                                       │
│                   window.electron.ipcRenderer                    │
└──────────────────────────┼───────────────────────────────────────┘
                           │ IPC 通信
┌──────────────────────────┼───────────────────────────────────────┐
│                   Preload (contextBridge)                        │
└──────────────────────────┼───────────────────────────────────────┘
                           │
┌──────────────────────────┼───────────────────────────────────────┐
│                        主进程 (Main)                             │
├──────────────────────────┼───────────────────────────────────────┤
│                          │                                       │
│  ┌─────────────┐  ┌──────┴──────┐  ┌─────────────┐              │
│  │   Services  │  │    IPC      │  │   Events    │              │
│  │ (业务逻辑)  │◄─┤  Handlers   │  │  (事件总线) │              │
│  └──────┬──────┘  └─────────────┘  └─────────────┘              │
│         │                                                        │
│  ┌──────┴──────┐  ┌─────────────┐                               │
│  │   SQLite    │  │   LanceDB   │                               │
│  │ (关系数据)  │  │ (向量数据)  │                               │
│  └─────────────┘  └─────────────┘                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 数据模型

### 1. AppSettings (应用设置)
```typescript
interface AppSettings {
  id?: number;                              // 主键 (固定为 1)
  theme: 'light' | 'dark' | 'system';       // 主题
  language: 'zh-CN' | 'en-US';              // 语言
  auto_update_on_launch: boolean;           // 启动时自动更新
  max_concurrent_tasks: number;             // 最大并发任务数
  user_preferences?: string;                // 用户偏好 (JSON 字符串)
}

// user_preferences JSON 结构
interface UserPreferences {
  translation_enabled?: boolean;            // 启用翻译
  auto_translation_enabled?: boolean;       // 自动翻译
  translation_mode?: 'append' | 'replace';  // 翻译显示模式
}
```

### 2. AIModel (AI 模型)
```typescript
interface AIModel {
  id?: number;                              // 主键
  name: string;                             // 模型显示名称
  provider: 'openai' | 'ollama' | 'local' | 'custom';  // 提供商
  base_url: string;                         // API 基础 URL
  api_key?: string;                         // API 密钥
  model_name: string;                       // 模型标识符
  type: 'llm' | 'embedding';                // 模型类型
  proxy_url?: string;                       // 代理 URL
  context_window?: number;                  // 上下文窗口大小
  is_built_in: boolean;                     // 是否内置模型
}
```

### 3. ModelAssignment (模型分配)
```typescript
type FunctionType = 'main_chat' | 'embedding' | 'translation' | 'insight' | 'script_generation';

interface ModelAssignment {
  function_type: FunctionType;              // 功能类型
  model_id: number | null;                  // 模型 ID
}
```

**注意**: `insight` 和 `script_generation` 在 LLMService 中会自动映射到 `main_chat`

### 4. FeedGroup (订阅源分组)
```typescript
interface FeedGroup {
  id?: number;                              // 主键
  name: string;                             // 分组名称
}
```

### 5. RSSFeed (RSS 订阅源)
```typescript
interface RSSFeed {
  id?: number;                              // 主键
  name: string;                             // 源名称
  url: string;                              // RSS URL (唯一)
  group_id?: number;                        // 分组 ID
  proxy_override?: string;                  // 代理覆盖
  parsing_script?: string;                  // AI 生成的解析脚本
  last_updated?: string;                    // 最后更新时间
  error_count?: number;                     // 错误计数
  update_interval?: number;                 // 更新间隔 (小时)
  cron_schedule?: string;                   // CRON 表达式
  // UI 计算字段
  last_fetch_status?: 'success' | 'failed'; // 最后抓取状态
  article_count?: number;                   // 文章数量
}
```

### 6. Article (文章)
```typescript
interface Article {
  id?: number;                              // 主键
  feed_id: number;                          // 所属源 ID
  title: string;                            // 标题
  url: string;                              // 文章 URL (唯一)
  content?: string;                         // 内容
  summary?: string;                         // 摘要
  publish_date?: string;                    // 发布日期
  author?: string;                          // 作者
  is_read: boolean;                         // 是否已读
  is_favorite: boolean;                     // 是否收藏
  embedding_status: 'none' | 'pending' | 'completed' | 'failed';  // 嵌入状态
  created_at?: string;                      // 创建时间
  // 翻译字段 (数据库存在但类型定义缺失)
  trans_title?: string;                     // 翻译标题
  trans_abstract?: string;                  // 翻译摘要
}
```

### 7. DailyInsight (每日洞察)
```typescript
interface DailyInsight {
  date: string;                             // 日期 (YYYY-MM-DD, 主键)
  summary_text: string;                     // 摘要文本
  recommendations_json: string;             // 推荐列表 (JSON)
}

interface Recommendation {
  title: string;
  reason?: string;
  type?: string;
  journal?: string;
  score?: number;
  abstract?: string;
  url?: string;
}
```

### 8. TopicInsight (主题洞察)
```typescript
interface TopicInsight {
  id: number;                               // 主键
  title: string;                            // 主题标题
  summary_text: string;                     // 摘要文本
  recommendations_json: string;             // 推荐列表 (JSON)
  config_json: string;                      // 配置参数 (JSON)
  created_at: string;                       // 创建时间
}
```

### 9. ChatHistory (聊天历史)
```typescript
interface ChatHistory {
  id: number;                               // 主键
  title: string;                            // 聊天标题
  messages: string;                         // 消息列表 (JSON)
  created_at: string;                       // 创建时间
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  time?: string;
  isError?: boolean;
  references?: any[];
}
```

---

## IPC 接口清单

### 配置相关

| 接口名 | 参数 | 返回值 | 服务方法 |
|--------|------|--------|----------|
| `config:get-settings` | - | `AppSettings` | `configService.getSettings()` |
| `config:update-settings` | `Partial<AppSettings>` | `AppSettings` | `configService.updateSettings()` |
| `config:get-assignments` | - | `ModelAssignment[]` | `configService.getAllAssignments()` |
| `config:set-assignment` | `type: FunctionType, modelId: number \| null` | `void` | `configService.setAssignment()` |

### 模型管理

| 接口名 | 参数 | 返回值 | 服务方法 |
|--------|------|--------|----------|
| `model:get-all` | - | `AIModel[]` | `modelService.getAll()` |
| `model:add` | `Omit<AIModel, 'id'>` | `AIModel` | `modelService.add()` |
| `model:update` | `id: number, model: Partial<AIModel>` | `void` | `modelService.update()` |
| `model:delete` | `id: number` | `void` | `modelService.delete()` |
| `model:test` | `AIModel` | `boolean` | `modelService.testConnection()` |

### 数据源管理

| 接口名 | 参数 | 返回值 | 服务方法 |
|--------|------|--------|----------|
| `source:get-all` | - | `RSSFeed[]` | `sourceService.getAllFeeds()` |
| `source:get-groups` | - | `FeedGroup[]` | `sourceService.getGroups()` |
| `source:add` | `Omit<RSSFeed, 'id'>` | `RSSFeed` | `sourceService.addFeed()` |
| `source:update` | `id: number, feed: Partial<RSSFeed>` | `void` | `sourceService.updateFeed()` |
| `source:delete` | `id: number` | `void` | `sourceService.deleteFeed()` |
| `source:update-all` | - | `void` | `sourceService.updateAll()` |
| `source:update-single` | `id: number` | `void` | `sourceService.fetchFeed()` |
| `source:generate-script` | `url: string` | `string` | `sourceService.generateScript()` |
| `fetch-raw-rss` | `url: string` | `object` | `sourceService.fetchRawRss()` |
| `debug-rss` | `{url, script}` | `{success, firstArticle?, error?}` | `sourceService.debugScript()` |

### 文章管理

| 接口名 | 参数 | 返回值 | 服务方法 |
|--------|------|--------|----------|
| `article:get-all` | `limit?: number, offset?: number` | `Article[]` | `articleService.getAll()` |
| `article:search` | `query: string` | `Article[]` | `articleService.search()` |
| `article:mark-read` | `id: number, isRead: boolean` | `void` | `articleService.markRead()` |
| `article:toggle-favorite` | `id: number` | `void` | `articleService.toggleFavorite()` |
| `article:translate` | `id: number` | `{trans_title, trans_abstract}` | `articleService.translateArticle()` |
| `export-to-ris` | `ids: number[]` | `{success, message?}` | `articleService.exportToRis()` |

### 向量搜索

| 接口名 | 参数 | 返回值 | 服务方法 |
|--------|------|--------|----------|
| `vector:search` | `query: string` | `any[]` | `vectorService.search()` |
| `vector:reset` | - | `void` | `vectorService.reset()` |
| `vector:get-stats` | - | `EmbeddingStats[]` | `vectorService.getStats()` |
| `vector:queue-feed` | `feedId: number` | `void` | `vectorService.queueFeed()` |

### 洞察生成

| 接口名 | 参数 | 返回值 | 服务方法 |
|--------|------|--------|----------|
| `insight:generate-daily` | - | `void` | `insightService.generateDailyInsight()` |
| `insight:generate-topic` | `topic: string` | `any` | `insightService.generateTopicInsight()` |
| `generate-smart-extraction` | `params: object` | `{success, data}` | `insightService.generateSmartExtraction()` |
| `get-topic-insights` | - | `TopicInsight[]` | `insightService.getAllTopicInsights()` |
| `delete-topic-insight` | `id: number` | `void` | `insightService.deleteTopicInsight()` |
| `rename-topic-insight` | `{id, title}` | `void` | `insightService.renameTopicInsight()` |
| `get-insights` | `date: string` | `DailyInsight \| null` | `insightService.getDailyInsight()` |
| `rerun-insights` | `{count: number}` | `void` | `insightService.rerunDailyInsight()` |

### LLM 聊天

| 接口名 | 参数 | 返回值 | 服务方法 |
|--------|------|--------|----------|
| `llm:chat` | `type, messages, options` | `string` | `llmService.chat()` |
| `ask-ai` | `{question: string}` | `string` | `chatService.askAI()` |
| `get-chat-history` | - | `ChatHistory[]` | `chatService.getAllChats()` |
| `save-chat` | `{id, title, messages}` | `{success, id}` | `chatService.saveChat()` |
| `delete-chat` | `id: number` | `{success}` | `chatService.deleteChat()` |

---

## 服务层方法

### ConfigService
- `initialize()` - 初始化配置服务
- `getSettings()` - 获取应用设置
- `updateSettings(settings)` - 更新应用设置
- `getAssignment(functionType)` - 获取指定功能的模型分配
- `setAssignment(functionType, modelId)` - 设置模型分配
- `getAllAssignments()` - 获取所有模型分配

### ModelService
- `getAll()` - 获取所有模型
- `getById(id)` - 根据 ID 获取模型
- `add(model)` - 添加模型
- `update(id, model)` - 更新模型
- `delete(id)` - 删除模型
- `testConnection(model)` - 测试模型连接

### SourceService
- `getAllFeeds()` - 获取所有订阅源
- `getGroups()` - 获取所有分组
- `addFeed(feed)` - 添加订阅源
- `updateFeed(id, feed)` - 更新订阅源
- `deleteFeed(id)` - 删除订阅源
- `updateAll()` - 更新所有订阅源
- `fetchFeed(feed)` - 抓取单个订阅源
- `fetchRawRss(url)` - 获取原始 RSS 内容
- `generateScript(url)` - AI 生成解析脚本
- `debugScript(url, script)` - 调试解析脚本

### ArticleService
- `create(article)` - 创建文章
- `getById(id)` - 根据 ID 获取文章
- `getAll(limit, offset)` - 获取文章列表
- `search(query)` - 搜索文章
- `markRead(id, isRead)` - 标记已读/未读
- `toggleFavorite(id)` - 切换收藏状态
- `updateEmbeddingStatus(id, status)` - 更新嵌入状态
- `translateArticle(id)` - 翻译文章
- `exportToRis(ids)` - 导出为 RIS 格式

### VectorService
- `search(query, limit)` - 向量搜索
- `reset()` - 重置向量库
- `getStats()` - 获取嵌入统计
- `queueFeed(feedId)` - 将订阅源加入嵌入队列
- `addToQueue(articleId)` - 将文章加入队列 (私有)
- `processQueue()` - 处理嵌入队列 (私有)
- `embedArticle(articleId)` - 嵌入单篇文章 (私有)
- `generateEmbedding(text)` - 生成向量 (私有)

### InsightService
- `generateDailyInsight()` - 生成每日洞察
- `generateTopicInsight(topic)` - 生成主题洞察
- `generateSmartExtraction(params)` - 生成智能提取
- `getAllTopicInsights()` - 获取所有主题洞察
- `getDailyInsight(date)` - 获取指定日期的每日洞察
- `deleteTopicInsight(id)` - 删除主题洞察
- `renameTopicInsight(id, title)` - 重命名主题洞察
- `rerunDailyInsight(count)` - 重新生成每日洞察

### LLMService
- `chat(functionType, messages, options)` - 调用 LLM 聊天
- `streamChat(functionType, messages, options)` - 流式调用 LLM
- `getClient(functionType)` - 获取 LLM 客户端 (私有)

### ChatService
- `askAI(question)` - 向 AI 提问 (RAG)
- `getAllChats()` - 获取所有聊天历史
- `saveChat(id, title, messages)` - 保存聊天
- `deleteChat(id)` - 删除聊天

---

## 前端 Store

### ConfigStore (src/renderer/src/store/config.ts)

**State:**
```typescript
{
  settings: AppSettings;
  models: AIModel[];
  assignments: ModelAssignment[];
  currentView: string;
}
```

**Actions:**
- `fetchSettings()` - 获取应用设置
- `updateSettings(settings)` - 更新应用设置
- `fetchModels()` - 获取所有模型
- `addModel(model)` - 添加模型
- `updateModel(id, model)` - 更新模型
- `deleteModel(id)` - 删除模型
- `testModel(model)` - 测试模型连接
- `fetchAssignments()` - 获取所有模型分配
- `setAssignment(type, modelId)` - 设置模型分配
- `applyTheme(theme)` - 应用主题
- `toggleTheme()` - 切换主题
- `initTheme()` - 初始化主题
- `initEventListeners()` - 初始化事件监听器

### DataStore (src/renderer/src/store/data.ts)

**State:**
```typescript
{
  articles: Article[];
  feeds: RSSFeed[];
  groups: FeedGroup[];
  selectedArticle: Article | null;
  totalArticles: number;
  isLoading: boolean;
  translatingIds: number[];
  isUpdatingAll: boolean;
  updateProgress: { current: number; total: number; percent: number; message: string };
  updatingFeedIds: number[];
  chatHistory: any[];
  topicInsights: any[];
}
```

**Actions:**
- `fetchFeeds()` - 获取所有订阅源
- `fetchChatHistory()` - 获取聊天历史
- `fetchGroups()` - 获取所有分组
- `fetchTopicInsights()` - 获取所有主题洞察
- `jumpToArticle(item)` - 跳转到文章
- `updateAllFeeds()` - 更新所有订阅源
- `updateSingleFeed(id)` - 更新单个订阅源
- `addFeed(feed)` - 添加订阅源
- `updateFeed(id, feed)` - 更新订阅源
- `deleteFeed(id)` - 删除订阅源
- `generateScript(url)` - 生成解析脚本
- `fetchArticles(limit, offset)` - 获取文章列表
- `searchArticles(query)` - 搜索文章
- `markRead(id, isRead)` - 标记已读/未读
- `toggleFavorite(id)` - 切换收藏状态
- `translateArticle(id)` - 翻译文章
- `selectArticle(article)` - 选择文章

### TaskStore (src/renderer/src/store/task.ts)

**State:**
```typescript
{
  updateProgress: { current: number; total: number; message: string };
  isUpdating: boolean;
  embeddingQueue: number[];
  embeddingStatus: Record<number, 'pending' | 'completed' | 'failed'>;
  embeddingStats: EmbeddingStats[];
  statsLoading: boolean;
  processing: boolean;
  queueStatus: { isProcessing: boolean; queueLength: number };
}
```

**Actions:**
- `initListeners()` - 初始化事件监听器
- `triggerUpdateAll()` - 触发更新所有源
- `fetchStats(showLoading)` - 获取嵌入统计
- `queueFeed(feedId)` - 将订阅源加入嵌入队列
- `resetVectorTable()` - 重置向量库

---

## 页面组件

### Dashboard.vue (仪表盘)
- 文献浏览、搜索、筛选
- 文章详情查看
- 收藏/取消收藏
- 嵌入进度显示

### Feeds.vue (订阅源管理)
- 添加/编辑/删除订阅源
- 一键更新所有订阅源
- 单个订阅源更新
- AI 生成解析脚本
- 调试解析脚本

### AIChat.vue (AI 对话)
- 基于文献库的 RAG 问答
- 聊天历史管理
- Markdown 渲染

### Insights.vue (每日洞察)
- 查看每日 AI 总结
- 日历选择历史日期
- 重新生成洞察

### SmartExtraction.vue (专题洞察)
- 配置提取参数
- 生成主题洞察
- 管理历史洞察

### Favorites.vue (我的收藏)
- 浏览收藏文献
- 批量导出 RIS 格式
- 取消收藏

### EmbeddingManager.vue (嵌入管理)
- 查看嵌入进度
- 批量嵌入
- 重置向量库

### Settings.vue (系统设置)
- 模型管理 (ModelManager 子组件)
- 功能模型分配
- 翻译设置
- 本地模型下载

### ModelManager.vue (模型管理)
- 添加/编辑/删除模型
- 测试模型连接

---

## 事件系统

### 事件类型定义 (src/main/events.ts)

```typescript
interface AppEventMap {
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
  'article:discovered': { url: string; title: string; feedId: number };
  'article:created': { id: number; title: string };
  'article:updated': { id: number; changes: Record<string, any> };
  'article:deleted': { id: number };

  // 处理流事件
  'embedding:queued': { articleId: number };
  'embedding:success': { articleId: number };
  'embedding:error': { articleId: number; error: string };
  'insight:generated': { type: string; content: string };
}
```

### 事件转发到渲染进程 (src/main/ipc.ts)

```typescript
const eventsToForward = [
  'config:updated',
  'model:updated',
  'source:update-start',
  'source:update-progress',
  'source:update-complete',
  'feed:fetch-start',
  'feed:fetch-success',
  'feed:fetch-error',
  'article:created',
  'article:updated',
  'embedding:queued',
  'embedding:success',
  'embedding:error',
  'insight:generated'
];
```

---

## 数据库表结构

### SQLite 表

#### ai_models
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PRIMARY KEY | 主键 |
| name | TEXT NOT NULL | 模型名称 |
| provider | TEXT NOT NULL | 提供商 |
| base_url | TEXT | API 基础 URL |
| api_key | TEXT | API 密钥 |
| model_name | TEXT NOT NULL | 模型标识符 |
| type | TEXT NOT NULL | 模型类型 |
| proxy_url | TEXT | 代理 URL |
| context_window | INTEGER | 上下文窗口大小 |
| is_built_in | BOOLEAN DEFAULT 0 | 是否内置 |
| created_at | DATETIME | 创建时间 |

#### model_assignments
| 字段 | 类型 | 说明 |
|------|------|------|
| function_type | TEXT PRIMARY KEY | 功能类型 |
| model_id | INTEGER | 模型 ID (外键) |

#### settings
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PRIMARY KEY CHECK (id = 1) | 主键 |
| theme | TEXT DEFAULT 'system' | 主题 |
| language | TEXT DEFAULT 'zh-CN' | 语言 |
| auto_update_on_launch | BOOLEAN DEFAULT 1 | 启动时自动更新 |
| max_concurrent_tasks | INTEGER DEFAULT 2 | 最大并发任务数 |
| user_preferences | TEXT | 用户偏好 (JSON) |

#### groups
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PRIMARY KEY | 主键 |
| name | TEXT NOT NULL | 分组名称 |

#### rss_feeds
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PRIMARY KEY | 主键 |
| name | TEXT NOT NULL | 源名称 |
| url | TEXT UNIQUE NOT NULL | RSS URL |
| parsing_script | TEXT | 解析脚本 |
| proxy_override | TEXT | 代理覆盖 |
| last_updated | DATETIME | 最后更新时间 |
| error_count | INTEGER DEFAULT 0 | 错误计数 |
| group_id | INTEGER | 分组 ID (外键) |
| update_interval | INTEGER DEFAULT 24 | 更新间隔 |
| cron_schedule | TEXT DEFAULT '0 0 * * *' | CRON 表达式 |

#### articles
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PRIMARY KEY | 主键 |
| feed_id | INTEGER | 源 ID (外键) |
| title | TEXT | 标题 |
| url | TEXT UNIQUE | 文章 URL |
| content | TEXT | 内容 |
| summary | TEXT | 摘要 |
| publish_date | TEXT | 发布日期 |
| author | TEXT | 作者 |
| is_read | BOOLEAN DEFAULT 0 | 是否已读 |
| is_favorite | BOOLEAN DEFAULT 0 | 是否收藏 |
| embedding_status | TEXT DEFAULT 'none' | 嵌入状态 |
| created_at | DATETIME | 创建时间 |
| trans_title | TEXT | 翻译标题 |
| trans_abstract | TEXT | 翻译摘要 |

#### daily_insights
| 字段 | 类型 | 说明 |
|------|------|------|
| date | TEXT PRIMARY KEY | 日期 |
| summary_text | TEXT | 摘要文本 |
| recommendations_json | TEXT | 推荐列表 (JSON) |

#### chat_history
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PRIMARY KEY | 主键 |
| title | TEXT | 聊天标题 |
| messages | TEXT | 消息列表 (JSON) |
| created_at | DATETIME | 创建时间 |

#### topic_insights
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PRIMARY KEY | 主键 |
| title | TEXT | 主题标题 |
| summary_text | TEXT | 摘要文本 |
| recommendations_json | TEXT | 推荐列表 (JSON) |
| config_json | TEXT | 配置 (JSON) |
| created_at | DATETIME | 创建时间 |

### LanceDB 表

#### articles (向量表)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 文章 ID |
| vector | FLOAT[] | 向量嵌入 |
| title | TEXT | 标题 |
| url | TEXT | URL |
| feed_id | INTEGER | 源 ID |
| publish_date | TEXT | 发布日期 |
| created_at | TEXT | 创建时间 |

---

## 业务流程

### 1. RSS 订阅更新流程
```
用户触发更新 / 启动时自动更新
    │
    ▼
SourceService.updateAll()
    │
    ├── emit('source:update-start')
    │
    ├── 遍历所有订阅源
    │   │
    │   ├── emit('source:update-progress')
    │   │
    │   └── fetchFeed(feed)
    │       │
    │       ├── emit('feed:fetch-start')
    │       │
    │       ├── 使用标准解析器或自定义脚本解析
    │       │
    │       ├── 对每篇新文章:
    │       │   │
    │       │   └── emit('article:discovered')
    │       │       │
    │       │       └── ArticleService 监听并创建文章
    │       │           │
    │       │           └── emit('article:created')
    │       │               │
    │       │               └── VectorService 监听并加入嵌入队列
    │       │
    │       └── emit('feed:fetch-success') 或 emit('feed:fetch-error')
    │
    └── emit('source:update-complete')
```

### 2. 文章嵌入流程
```
文章创建 / 手动触发嵌入
    │
    ▼
VectorService.addToQueue(articleId)
    │
    ├── 更新文章状态为 'pending'
    │
    ├── emit('embedding:queued')
    │
    └── processQueue()
        │
        ├── 检查并发限制
        │
        └── embedArticle(articleId)
            │
            ├── 获取文章内容
            │
            ├── generateEmbedding(text)
            │   │
            │   ├── OpenAI/Custom: 调用 API
            │   ├── Ollama: 调用本地 API
            │   └── Local: 使用 Worker 线程
            │
            ├── 存储到 LanceDB
            │
            ├── 更新文章状态为 'completed'
            │
            └── emit('embedding:success') 或 emit('embedding:error')
```

### 3. RAG 问答流程
```
用户提问
    │
    ▼
ChatService.askAI(question)
    │
    ├── VectorService.search(question)
    │   │
    │   ├── 生成问题向量
    │   │
    │   └── LanceDB 向量搜索
    │
    ├── 构建 RAG Prompt (系统提示 + 上下文 + 问题)
    │
    └── LLMService.chat('main_chat', messages)
        │
        ├── 获取模型分配
        │
        └── 调用 LLM API
```

### 4. 洞察生成流程

#### 4.1 当前实现（存在问题）
```
用户触发 / 定时任务
    │
    ▼
InsightService.generateDailyInsight()
    │
    ├── 查询最近 24 小时的文章 (简单SQL查询，未使用向量搜索)
    │
    ├── 构建 LLM Prompt
    │
    ├── LLMService.chat('insight', messages)
    │   │
    │   └── (自动映射到 main_chat 模型)
    │
    ├── 解析 JSON 响应
    │
    ├── 保存到 daily_insights 表
    │
    └── emit('insight:generated')
```

#### 4.2 预期实现（应该的流程）
```
用户触发 / 定时任务
    │
    ▼
InsightService.generateDailyInsight()
    │
    ├── 获取用户研究偏好 (user_preferences)
    │
    ├── VectorService.search(研究偏好)
    │   │
    │   ├── 使用 embedding 模型生成偏好向量
    │   │
    │   └── 在向量库中搜索相关文章
    │
    ├── 构建 LLM Prompt (包含相关文章上下文)
    │
    ├── LLMService.chat('insight', messages)
    │
    ├── 解析 JSON 响应
    │
    ├── 保存到 daily_insights 表
    │
    └── emit('insight:generated')
```

---

## 已知问题和设计缺陷

### 1. 业务逻辑与设计初衷不符

#### 1.1 每日洞察未使用向量搜索
- **问题**: 每日洞察应该基于用户研究偏好使用embedding模型进行语义匹配，但当前只是简单获取最近24小时的所有文章
- **影响**: 推荐的文章可能与用户研究方向无关

#### 1.2 专题洞察是模拟实现
- **问题**: `generateSmartExtraction` 返回硬编码的假数据
- **影响**: 专题洞察功能完全不可用

#### 1.3 研究偏好未被使用
- **问题**: 用户可以设置研究偏好，但这些偏好在生成洞察时没有被使用
- **影响**: 个性化推荐功能失效

### 2. 按钮无功能

#### 2.1 Dashboard Filter按钮
- **位置**: Dashboard.vue 左侧导航栏
- **问题**: 点击无反应，未绑定事件

#### 2.2 Dashboard 添加分组按钮
- **位置**: Dashboard.vue 订阅源区域
- **问题**: 点击无反应，分组管理功能未实现

### 3. 业务链路不通畅

#### 3.1 翻译功能
- **问题1**: Dashboard 中没有翻译按钮
- **问题2**: 翻译结果（trans_title, trans_abstract）在详情面板中不显示
- **问题3**: 自动翻译功能未实现

#### 3.2 AI对话上下文
- **问题**: ChatService.askAI 使用了不存在的字段 `c.text`
- **影响**: RAG问答可能无法正确获取文章内容

#### 3.3 向量库重置
- **问题**: VectorService.reset() 中删除向量数据的代码被注释掉
- **影响**: 重置向量库功能不完整

### 4. 数据结构不一致

#### 4.1 Favorites.vue 字段名错误
| 使用的字段 | 实际字段 |
|-----------|---------|
| `publication_date` | `publish_date` |
| `journal_info` | 不存在 |
| `authors` | `author` |
| `abstract` | `summary` |

#### 4.2 Article类型定义不完整
- 缺少 `trans_title` 和 `trans_abstract` 字段
- 导致代码中大量使用 `as any` 类型断言

### 5. 事件监听参数错误
- **问题**: TaskStore 中事件监听器使用 `(_: any, progress: any)` 格式
- **原因**: preload 中的 `on` 方法直接传递 payload，不传递 event 对象
- **正确格式**: `(progress: any)`
