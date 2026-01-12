# LarRsScholar 项目文档

## 目录
- [项目概述](#项目概述)
- [技术栈](#技术栈)
- [数据模型](#数据模型)
- [IPC 接口文档](#ipc-接口文档)
- [服务层文档](#服务层文档)
- [事件系统](#事件系统)
- [渲染进程状态管理](#渲染进程状态管理)
- [Preload API](#preload-api)
- [数据库架构](#数据库架构)
- [工作流程](#工作流程)

---

## 项目概述

LarRsScholar 是一个基于 Electron + Vue 3 + TypeScript 的学术研究助手应用，主要功能包括：

- **RSS 订阅源管理**：订阅和管理多个 RSS 源，自动抓取文章
- **文章收集和翻译**：收集文章内容，支持 AI 翻译
- **向量嵌入和语义搜索**：使用向量数据库进行语义搜索
- **AI 洞察生成**：基于收集的文章生成每日洞察和主题洞察
- **智能对话**：基于文章内容的 AI 对话助手
- **模型管理**：支持多种 AI 模型（OpenAI、Ollama、本地模型等）

## 系统稳定性优化（2026-01-08）

### 1. 设置页面功能模型分配选择器保存问题修复

**问题描述**：
- 设置页面中功能模型分配选择器无法保存用户的选择
- 原因：保存逻辑中使用了条件判断 `if (newVal.main_llm_id)`，导致只有当值存在时才保存

**解决方案**：
- 移除条件判断，允许保存 null 值
- 使用 `Promise.all` 并行保存所有模型分配，提高效率
- 添加错误提示，保存失败时显示友好的错误消息

**修改文件**：
- `src/renderer/src/views/Settings.vue`：修改自动保存逻辑
- `src/shared/types.ts`：将 `ModelAssignment.model_id` 类型改为 `number | null`
- `src/main/services/ConfigService.ts`：更新 `setAssignment` 方法支持 null 值

### 2. 设置页面完全重写（2026-01-08）

**问题描述**：
- 设置页面中功能模型分配选择器无法保存用户的选择
- 切换页面后模型分配显示为空
- 点击选择器后无法选中选项
- 原因：复杂的 watch 逻辑导致数据不一致和竞态条件

**解决方案**：
- 完全重写设置页面，采用更清晰、更可靠的架构
- 移除复杂的 watch 逻辑，使用 computed 属性直接绑定到 store
- 分离翻译设置和模型分配的关注点
- 模型分配使用 computed 属性，选择后立即保存到 store
- 翻译设置使用自动保存，1 秒防抖
- 移除 `isDirty` 和 `isSyncing` 标志，简化状态管理
- 修复 CustomSelect 组件的事件时序问题，使用 setTimeout 延迟关闭下拉菜单
- 将 computed 属性的 setter 改为 async，确保异步操作正确执行
- 添加详细的调试日志，便于追踪问题
- 关闭 ConfigService 的刷屏日志
- **关键修复**：在 configStore 中添加事件监听器，监听主进程的 `config:updated` 事件并自动更新 assignments
- 在 App.vue 的 onMounted 中初始化事件监听器

**新架构优势**：
1. **数据流清晰**：模型分配直接绑定到 store，没有中间层
2. **无竞态条件**：移除了复杂的 watch 逻辑
3. **实时保存**：模型分配选择后立即保存到 store
4. **易于维护**：代码更简洁，逻辑更清晰
5. **类型安全**：computed 属性提供更好的类型推断
6. **事件时序正确**：确保值更新后再关闭下拉菜单
7. **调试友好**：添加详细的调试日志，便于问题排查
8. **响应式更新**：通过事件监听器实现主进程和渲染进程的数据同步

**修改文件**：
- `src/renderer/src/views/Settings.vue`：完全重写
- `src/renderer/src/components/CustomSelect.vue`：修复事件时序问题，添加调试日志
- `src/renderer/src/store/config.ts`：添加 initEventListeners 方法，移除 setAssignment 中的 fetchAssignments 调用
- `src/renderer/src/App.vue`：在 onMounted 中调用 initEventListeners
- `src/main/services/ConfigService.ts`：关闭刷屏日志

### 3. Element Plus radio-button 警告修复（2026-01-08）

**问题描述**：
- 控制台显示警告：`[el-radio] [API] label act as value is about to be deprecated in version 3.0.0, please use value instead`
- 原因：Element Plus 3.0 版本中，`el-radio-button` 的 `label` 属性已被弃用

**解决方案**：
- 将 `el-radio-button` 的 `label` 属性改为 `value` 属性

**修改文件**：
- `src/renderer/src/views/Settings.vue`：修改翻译显示模式的 radio-button

### 2. 增强错误处理和日志记录

**改进内容**：
- 为所有服务添加统一的日志工具函数
- 实现详细的错误日志记录，包括错误上下文
- 添加操作成功/失败的日志记录
- 改进错误消息的用户友好性

**修改文件**：
- `src/main/services/ConfigService.ts`：添加日志工具，增强所有方法的错误处理
- `src/main/services/VectorService.ts`：添加日志工具，记录嵌入队列状态
- `src/main/services/SourceService.ts`：添加日志工具，记录 RSS 抓取过程

### 3. 改进并发控制机制

**VectorService 并发控制优化**：
- 从串行处理改为真正的并发控制
- 使用 `activeTasks` 计数器跟踪活跃任务数
- 支持配置最大并发数（从设置中读取）
- 添加重试机制，失败的任务最多重试 3 次
- 改进队列处理逻辑，使用 while 循环确保充分利用并发槽位

**SourceService 并发控制优化**：
- 从串行更新改为并发更新
- 实现并发槽位机制，避免过多并发请求
- 支持配置最大并发更新数（默认 3，可从设置中覆盖）
- 添加请求超时控制（30 秒）
- 改进错误处理，单个源失败不影响其他源

**修改文件**：
- `src/main/services/VectorService.ts`：重构队列处理逻辑，添加重试机制
- `src/main/services/SourceService.ts`：实现并发控制，添加超时处理

### 4. 加强数据一致性保护

**改进内容**：
- ConfigService 添加默认值处理，避免空值导致错误
- VectorService 添加模型 ID 空值检查
- SourceService 添加文章数组类型验证
- 所有数据库操作添加 try-catch 保护

### 5. 完善边界情况处理

**改进内容**：
- 添加网络请求超时控制（30 秒）
- 验证解析脚本的返回值类型
- 处理空数组和无效数据
- 添加 Worker 线程退出事件监听
- 改进错误分类和提示

### 6. 性能优化

**优化内容**：
- 使用 `Promise.all` 并行执行多个独立操作
- 减少不必要的数据库查询
- 优化队列处理算法
- 添加队列长度日志，便于性能监控

## 优化效果

### 稳定性提升
- ✅ 设置页面模型分配选择器正常保存
- ✅ 嵌入计算支持并发，处理速度提升
- ✅ RSS 更新支持并发，更新速度提升
- ✅ 错误重试机制提高任务成功率
- ✅ 详细的日志记录便于问题排查

### 用户体验改善
- ✅ 保存失败时显示友好错误提示
- ✅ 并发处理提高响应速度
- ✅ 错误消息更清晰易懂
- ✅ 系统状态实时反馈

### 代码质量提升
- ✅ 统一的日志格式
- ✅ 完善的错误处理
- ✅ 更好的类型安全
- ✅ 清晰的代码注释

---

## 技术栈

### 主进程
- **Electron**: 桌面应用框架
- **SQLite**: 关系型数据库（better-sqlite3）
- **LanceDB**: 向量数据库
- **OpenAI SDK**: AI 模型调用
- **rss-parser**: RSS 解析
- **Worker Threads**: 嵌入计算工作线程

### 渲染进程
- **Vue 3**: 前端框架
- **TypeScript**: 类型安全
- **Pinia**: 状态管理
- **Element Plus**: UI 组件库
- **Tailwind CSS**: 样式框架

---

## 数据模型

### AppSettings
应用设置接口

```typescript
interface AppSettings {
  id?: number;
  theme: 'light' | 'dark' | 'system';  // 主题
  language: 'zh-CN' | 'en-US';          // 语言
  auto_update_on_launch: boolean;       // 启动时自动更新
  max_concurrent_tasks: number;         // 最大并发任务数
  user_preferences?: string;            // 其他偏好设置（JSON 字符串）
}
```

### AIModel
AI 模型接口

```typescript
interface AIModel {
  id?: number;
  name: string;                         // 模型名称
  provider: 'openai' | 'ollama' | 'local' | 'custom';  // 提供商
  base_url: string;                     // API 基础 URL
  api_key?: string;                     // API 密钥
  model_name: string;                   // 模型标识符
  type: ModelType;                      // 模型类型
  proxy_url?: string;                   // 代理 URL
  context_window?: number;              // 上下文窗口大小
  is_built_in: boolean;                 // 是否内置模型
}
```

### ModelType
模型类型

```typescript
type ModelType = 'llm' | 'embedding';
```

### FunctionType
功能类型（用于模型分配）

```typescript
type FunctionType = 'main_chat' | 'embedding' | 'translation' | 'insight' | 'script_generation';
```

### ModelAssignment
模型分配接口

```typescript
interface ModelAssignment {
  function_type: FunctionType;  // 功能类型
  model_id: number;             // 模型 ID
}
```

### FeedGroup
RSS 源分组

```typescript
interface FeedGroup {
  id?: number;
  name: string;
}
```

### RSSFeed
RSS 订阅源

```typescript
interface RSSFeed {
  id?: number;
  name: string;                         // 源名称
  url: string;                          // RSS URL
  group_id?: number;                    // 分组 ID
  proxy_override?: string;              // 代理覆盖
  parsing_script?: string;              // AI 生成的解析脚本
  last_updated?: string;                // 最后更新时间
  error_count?: number;                 // 错误计数
  // UI 字段
  last_fetch_status?: 'success' | 'failed';
  article_count?: number;
  update_interval?: number;
  cron_schedule?: string;
}
```

### Article
文章接口

```typescript
interface Article {
  id?: number;
  feed_id: number;                      // 所属源 ID
  title: string;                        // 标题
  url: string;                          // 文章 URL
  content?: string;                     // 内容
  summary?: string;                     // 摘要
  publish_date?: string;                // 发布日期
  author?: string;                      // 作者
  is_read: boolean;                     // 是否已读
  is_favorite: boolean;                 // 是否收藏
  embedding_status: 'none' | 'pending' | 'completed' | 'failed';  // 嵌入状态
  created_at?: string;                  // 创建时间
  // 翻译字段（数据库中存在但类型定义中未包含）
  trans_title?: string;                 // 翻译标题
  trans_abstract?: string;              // 翻译摘要
}
```

### IpcResponse
IPC 响应接口

```typescript
interface IpcResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}
```

---

## IPC 接口文档

### 配置相关接口

#### `config:get-settings`
获取应用设置

**返回**: `AppSettings`

#### `config:update-settings`
更新应用设置

**参数**: `Partial<AppSettings>`

**返回**: `AppSettings`

#### `config:get-assignments`
获取所有模型分配

**返回**: `ModelAssignment[]`

#### `config:set-assignment`
设置模型分配

**参数**: 
- `type`: `FunctionType` - 功能类型
- `modelId`: `number` - 模型 ID

---

### 模型管理接口

#### `model:get-all`
获取所有模型

**返回**: `AIModel[]`

#### `model:add`
添加模型

**参数**: `Omit<AIModel, 'id'>`

**返回**: `AIModel`

#### `model:update`
更新模型

**参数**: 
- `id`: `number` - 模型 ID
- `model`: `Partial<AIModel>` - 更新数据

#### `model:delete`
删除模型

**参数**: `id` - 模型 ID

#### `model:test`
测试模型连接

**参数**: `AIModel`

**返回**: `boolean`

---

### 数据源管理接口

#### `source:get-all`
获取所有 RSS 源

**返回**: `RSSFeed[]`

#### `source:get-groups`
获取所有分组

**返回**: `FeedGroup[]`

#### `source:add`
添加 RSS 源

**参数**: `Omit<RSSFeed, 'id'>`

**返回**: `RSSFeed`

#### `source:update`
更新 RSS 源

**参数**: 
- `id`: `number` - 源 ID
- `feed`: `Partial<RSSFeed>` - 更新数据

#### `source:delete`
删除 RSS 源

**参数**: `id` - 源 ID

#### `source:update-all`
更新所有 RSS 源

**返回**: `void`

#### `source:update-single`
更新单个 RSS 源

**参数**: `id` - 源 ID

**返回**: `void`

#### `source:generate-script`
生成解析脚本

**参数**: `url` - 网页 URL

**返回**: `string` - JavaScript 解析脚本

#### `fetch-raw-rss`
获取原始 RSS 内容

**参数**: `url` - RSS URL

**返回**: 包含标题、描述和前 5 篇文章的对象

---

### 文章管理接口

#### `article:get-all`
获取所有文章

**参数**: 
- `limit`: `number` - 限制数量（默认 100）
- `offset`: `number` - 偏移量（默认 0）

**返回**: `Article[]`

#### `article:search`
搜索文章

**参数**: `query` - 搜索关键词

**返回**: `Article[]`

#### `article:mark-read`
标记文章已读/未读

**参数**: 
- `id`: `number` - 文章 ID
- `isRead`: `boolean` - 是否已读

#### `article:toggle-favorite`
切换文章收藏状态

**参数**: `id` - 文章 ID

#### `article:translate`
翻译文章

**参数**: `id` - 文章 ID

**返回**: `{ trans_title: string; trans_abstract: string }`

#### `export-to-ris`
导出文章为 RIS 格式

**参数**: `ids` - 文章 ID 数组

**返回**: `{ success: boolean; message?: string }`

---

### 向量搜索接口

#### `vector:search`
向量搜索

**参数**: `query` - 搜索查询

**返回**: 搜索结果数组

#### `vector:reset`
重置向量库

**返回**: `void`

#### `vector:get-stats`
获取嵌入统计信息

**返回**: 包含每个源的嵌入统计的数组

#### `vector:queue-feed`
将源的文章加入嵌入队列

**参数**: `feedId` - 源 ID

**返回**: `void`

---

### 洞察生成接口

#### `insight:generate-daily`
生成每日洞察

**返回**: `void`

#### `insight:generate-topic`
生成主题洞察

**参数**: `topic` - 主题

**返回**: 洞察内容

#### `generate-smart-extraction`
生成智能提取

**参数**: `params` - 提取参数

**返回**: `{ success: boolean; data: any }`

#### `get-topic-insights`
获取所有主题洞察

**返回**: 主题洞察数组

#### `delete-topic-insight`
删除主题洞察

**参数**: `id` - 洞察 ID

#### `rename-topic-insight`
重命名主题洞察

**参数**: `{ id: number; title: string }`

#### `get-insights`
获取每日洞察

**参数**: `date` - 日期（YYYY-MM-DD）

**返回**: 每日洞察对象

---

### LLM 聊天接口

#### `llm:chat`
LLM 聊天

**参数**: 
- `type`: `FunctionType` - 功能类型
- `messages`: `ChatMessage[]` - 消息数组
- `options`: `ChatOptions` - 聊天选项

**返回**: `string` - AI 响应

#### `ask-ai`
向 AI 提问（基于向量搜索）

**参数**: `{ question: string }`

**返回**: `string` - AI 回答

#### `get-chat-history`
获取聊天历史

**返回**: 聊天历史数组

#### `save-chat`
保存聊天

**参数**: `{ id: number | null; title: string; messages: any[] }`

**返回**: `{ success: boolean; id: number }`

#### `delete-chat`
删除聊天

**参数**: `id` - 聊天 ID

**返回**: `{ success: boolean }`

---

## 服务层文档

### ConfigService
配置管理服务

#### 方法

##### `initialize()`
初始化配置服务，确保默认设置存在

##### `getSettings(): AppSettings`
获取应用设置

##### `updateSettings(settings: Partial<AppSettings>): AppSettings`
更新应用设置，触发 `config:updated` 事件

##### `getAssignment(functionType: FunctionType): ModelAssignment | null`
获取指定功能类型的模型分配

##### `setAssignment(functionType: FunctionType, modelId: number): void`
设置模型分配，触发 `config:updated` 事件

##### `getAllAssignments(): ModelAssignment[]`
获取所有模型分配

---

### ModelService
AI 模型管理服务

#### 方法

##### `getAll(): AIModel[]`
获取所有模型

##### `getById(id: number): AIModel | undefined`
根据 ID 获取模型

##### `add(model: Omit<AIModel, 'id'>): AIModel`
添加模型，触发 `model:updated` 事件

##### `update(id: number, model: Partial<AIModel>): void`
更新模型，触发 `model:updated` 事件

##### `delete(id: number): void`
删除模型，同时删除相关的模型分配，触发 `model:updated` 事件

##### `async testConnection(model: AIModel): Promise<boolean>`
测试模型连接是否可用

---

### SourceService
RSS 源管理服务

#### 方法

##### `getAllFeeds(): RSSFeed[]`
获取所有 RSS 源

##### `getGroups(): FeedGroup[]`
获取所有分组

##### `addFeed(feed: Omit<RSSFeed, 'id'>): RSSFeed`
添加 RSS 源

##### `updateFeed(id: number, feed: Partial<RSSFeed>): void`
更新 RSS 源

##### `deleteFeed(id: number): void`
删除 RSS 源

##### `async updateAll(): Promise<void>`
更新所有 RSS 源
- 触发 `source:update-start` 事件
- 触发 `source:update-progress` 事件（进度更新）
- 触发 `source:update-complete` 事件

##### `async fetchFeed(feed: RSSFeed): Promise<void>`
抓取单个 RSS 源
- 触发 `feed:fetch-start` 事件
- 触发 `article:discovered` 事件（发现新文章）
- 触发 `feed:fetch-success` 事件
- 触发 `feed:fetch-error` 事件（失败时）

##### `async fetchRawRss(url: string): Promise<any>`
获取原始 RSS 内容

##### `async generateScript(url: string): Promise<string>`
使用 AI 生成网页解析脚本

---

### ArticleService
文章管理服务

#### 方法

##### `create(article: Omit<Article, 'id' | 'created_at'>): Article`
创建文章，触发 `article:created` 事件

##### `getById(id: number): Article | undefined`
根据 ID 获取文章

##### `getAll(limit = 100, offset = 0): Article[]`
获取文章列表

##### `search(query: string): Article[]`
搜索文章（基于 SQL LIKE）

##### `markRead(id: number, isRead = true): void`
标记文章已读/未读，触发 `article:updated` 事件

##### `toggleFavorite(id: number): void`
切换文章收藏状态，触发 `article:updated` 事件

##### `updateEmbeddingStatus(id: number, status: Article['embedding_status']): void`
更新文章嵌入状态，触发 `article:updated` 事件

##### `async translateArticle(id: number): Promise<{ trans_title: string; trans_abstract: string }>`
翻译文章

##### `async exportToRis(ids: number[]): Promise<{ success: boolean; message?: string }>`
导出文章为 RIS 格式

---

### VectorService
向量嵌入和搜索服务

#### 方法

##### `private initWorker()`
初始化嵌入计算工作线程

##### `private addToQueue(articleId: number)`
将文章加入嵌入队列
- 触发 `embedding:queued` 事件

##### `private async processQueue()`
处理嵌入队列

##### `private async embedArticle(articleId: number)`
嵌入单篇文章

##### `private async generateEmbedding(text: string): Promise<number[]>`
生成文本向量
- 支持 OpenAI、Ollama、本地模型

##### `async search(query: string, limit = 10): Promise<any[]>`
向量搜索

##### `async reset(): Promise<void>`
重置向量库

##### `async getStats(): Promise<any[]>`
获取嵌入统计信息

##### `async queueFeed(feedId: number): Promise<void>`
将源的所有文章加入嵌入队列

---

### InsightService
洞察生成服务

#### 方法

##### `async generateDailyInsight(): Promise<void>`
生成每日洞察
- 获取最近 24 小时的文章
- 使用 LLM 生成摘要和推荐
- 触发 `insight:generated` 事件

##### `async generateTopicInsight(topic: string): Promise<any>`
生成主题洞察
- 使用向量搜索相关文章
- 生成综合洞察报告
- 触发 `insight:generated` 事件

##### `async generateSmartExtraction(params: any): Promise<any>`
生成智能提取（当前为模拟实现）

##### `getAllTopicInsights()`
获取所有主题洞察

##### `getDailyInsight(date: string)`
获取指定日期的每日洞察

##### `deleteTopicInsight(id: number)`
删除主题洞察

##### `renameTopicInsight(id: number, title: string)`
重命名主题洞察

---

### LLMService
LLM 调用服务

#### 接口

##### `ChatMessage`
```typescript
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
```

##### `ChatOptions`
```typescript
interface ChatOptions {
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}
```

#### 方法

##### `private getClient(functionType: FunctionType): { client: OpenAI; modelName: string }`
获取指定功能类型的 LLM 客户端

##### `async chat(functionType: FunctionType, messages: ChatMessage[], options: ChatOptions = {}): Promise<string>`
调用 LLM 聊天

##### `async *streamChat(functionType: FunctionType, messages: ChatMessage[], options: ChatOptions = {}): AsyncGenerator<string, void, unknown>`
流式调用 LLM 聊天

---

### ChatService
聊天服务

#### 方法

##### `async askAI(question: string): Promise<string>`
向 AI 提问
- 使用向量搜索获取相关上下文
- 调用 LLM 生成回答

##### `getAllChats()`
获取所有聊天历史

##### `saveChat(id: number | null, title: string, messages: any[])`
保存聊天

##### `deleteChat(id: number)`
删除聊天

---

## 事件系统

### 事件类型定义

#### 系统级事件

##### `app:ready`
应用初始化完成

**Payload**: `void`

##### `app:quit`
应用退出

**Payload**: `void`

---

#### 配置/模型事件

##### `config:updated`
配置更新

**Payload**: `void`

##### `model:updated`
模型更新

**Payload**: `void`

---

#### 数据源事件

##### `source:update-start`
开始更新所有源

**Payload**: `void`

##### `source:update-progress`
更新进度

**Payload**: `{ current: number; total: number; message?: string }`

##### `source:update-complete`
更新完成

**Payload**: `void`

##### `feed:fetch-start`
开始抓取源

**Payload**: `{ feedId: number; url: string }`

##### `feed:fetch-success`
源抓取成功

**Payload**: `{ feedId: number; newArticlesCount: number }`

##### `feed:fetch-error`
源抓取失败

**Payload**: `{ feedId: number; error: string }`

---

#### 文章事件

##### `article:discovered`
发现新文章（尚未入库）

**Payload**: `{ url: string; title: string; feedId: number }`

##### `article:created`
新文章已入库

**Payload**: `{ id: number; title: string }`

##### `article:updated`
文章更新

**Payload**: `{ id: number; changes: Record<string, any> }`

##### `article:deleted`
文章删除

**Payload**: `{ id: number }`

---

#### 处理流事件

##### `embedding:queued`
文章加入嵌入队列

**Payload**: `{ articleId: number }`

##### `embedding:success`
文章嵌入成功

**Payload**: `{ articleId: number }`

##### `embedding:error`
文章嵌入失败

**Payload**: `{ articleId: number; error: string }`

##### `insight:generated`
洞察生成完成

**Payload**: `{ type: string; content: string }`

---

## 渲染进程状态管理

### ConfigStore
配置状态管理

#### State
```typescript
{
  settings: AppSettings;
  models: AIModel[];
  assignments: ModelAssignment[];
  currentView: string;
}
```

#### Actions

##### `async fetchSettings()`
获取应用设置

##### `async updateSettings(settings: Partial<AppSettings>)`
更新应用设置

##### `async fetchModels()`
获取所有模型

##### `async addModel(model: Omit<AIModel, 'id'>)`
添加模型

##### `async updateModel(id: number, model: Partial<AIModel>)`
更新模型

##### `async deleteModel(id: number)`
删除模型

##### `async testModel(model: AIModel)`
测试模型连接

##### `async fetchAssignments()`
获取所有模型分配

##### `async setAssignment(type: string, modelId: number)`
设置模型分配

##### `applyTheme(theme: string)`
应用主题

##### `toggleTheme()`
切换主题

##### `initTheme()`
初始化主题

---

### DataStore
数据状态管理

#### State
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
  updateProgress: { current: number; total: number };
  updatingFeedIds: number[];
  chatHistory: any[];
  topicInsights: any[];
}
```

#### Actions

##### `async fetchFeeds()`
获取所有 RSS 源

##### `async fetchChatHistory()`
获取聊天历史

##### `async fetchGroups()`
获取所有分组

##### `async fetchTopicInsights()`
获取所有主题洞察

##### `jumpToArticle(item: any)`
跳转到文章（在新窗口打开）

##### `async updateAllFeeds()`
更新所有 RSS 源

##### `async updateSingleFeed(id: number)`
更新单个 RSS 源

##### `async addFeed(feed: Omit<RSSFeed, 'id'>)`
添加 RSS 源

##### `async updateFeed(id: number, feed: Partial<RSSFeed>)`
更新 RSS 源

##### `async deleteFeed(id: number)`
删除 RSS 源

##### `async generateScript(url: string)`
生成解析脚本

##### `async fetchArticles(limit = 100, offset = 0)`
获取文章列表

##### `async searchArticles(query: string)`
搜索文章

##### `async markRead(id: number, isRead: boolean)`
标记文章已读/未读

##### `async toggleFavorite(id: number)`
切换文章收藏状态

##### `async translateArticle(id: number)`
翻译文章

##### `selectArticle(article: Article)`
选择文章

---

### TaskStore
任务状态管理

#### State
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

#### Actions

##### `initListeners()`
初始化事件监听器

##### `async triggerUpdateAll()`
触发更新所有源

##### `async fetchStats(showLoading = true)`
获取嵌入统计信息

##### `async queueFeed(feedId: number)`
将源加入嵌入队列

##### `async resetVectorTable()`
重置向量库

---

## Preload API

### 暴露的 API

#### `window.electron.shell.openExternal(url: string)`
在默认浏览器中打开外部链接

#### `window.electron.ipcRenderer.send(channel: string, data: any)`
发送 IPC 消息（单向）

#### `window.electron.ipcRenderer.invoke(channel: string, data: any)`
调用 IPC 处理程序（双向）

#### `window.electron.ipcRenderer.on(channel: string, func: (...args: any[]) => void)`
监听 IPC 事件

**返回**: 取消监听的函数

---

## 数据库架构

### SQLite 表结构

#### ai_models
AI 模型表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| name | TEXT | 模型名称 |
| provider | TEXT | 提供商 |
| base_url | TEXT | API 基础 URL |
| api_key | TEXT | API 密钥 |
| model_name | TEXT | 模型标识符 |
| type | TEXT | 模型类型 |
| proxy_url | TEXT | 代理 URL |
| context_window | INTEGER | 上下文窗口大小 |
| is_built_in | BOOLEAN | 是否内置 |
| created_at | DATETIME | 创建时间 |

#### model_assignments
模型分配表

| 字段 | 类型 | 说明 |
|------|------|------|
| function_type | TEXT | 功能类型（主键） |
| model_id | INTEGER | 模型 ID（外键） |

#### settings
设置表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键（固定为 1） |
| theme | TEXT | 主题 |
| language | TEXT | 语言 |
| auto_update_on_launch | BOOLEAN | 启动时自动更新 |
| max_concurrent_tasks | INTEGER | 最大并发任务数 |
| user_preferences | TEXT | 其他偏好设置（JSON） |

#### groups
分组表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| name | TEXT | 分组名称 |

#### rss_feeds
RSS 源表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| name | TEXT | 源名称 |
| url | TEXT | RSS URL（唯一） |
| parsing_script | TEXT | 解析脚本 |
| proxy_override | TEXT | 代理覆盖 |
| last_updated | DATETIME | 最后更新时间 |
| error_count | INTEGER | 错误计数 |
| group_id | INTEGER | 分组 ID（外键） |

#### articles
文章表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| feed_id | INTEGER | 源 ID（外键） |
| title | TEXT | 标题 |
| url | TEXT | 文章 URL（唯一） |
| content | TEXT | 内容 |
| summary | TEXT | 摘要 |
| publish_date | TEXT | 发布日期 |
| author | TEXT | 作者 |
| is_read | BOOLEAN | 是否已读 |
| is_favorite | BOOLEAN | 是否收藏 |
| embedding_status | TEXT | 嵌入状态 |
| created_at | DATETIME | 创建时间 |
| trans_title | TEXT | 翻译标题 |
| trans_abstract | TEXT | 翻译摘要 |

#### daily_insights
每日洞察表

| 字段 | 类型 | 说明 |
|------|------|------|
| date | TEXT | 日期（主键） |
| summary_text | TEXT | 摘要文本 |
| recommendations_json | TEXT | 推荐列表（JSON） |

#### chat_history
聊天历史表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| title | TEXT | 聊天标题 |
| messages | TEXT | 消息列表（JSON） |
| created_at | DATETIME | 创建时间 |

#### topic_insights
主题洞察表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| title | TEXT | 主题标题 |
| summary_text | TEXT | 摘要文本 |
| recommendations_json | TEXT | 推荐列表（JSON） |
| config_json | TEXT | 配置（JSON） |
| created_at | DATETIME | 创建时间 |

### LanceDB 表结构

#### articles
文章向量表

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

## 工作流程

### RSS 订阅更新流程

1. **触发更新**
   - 用户手动触发或应用启动时自动触发
   - 调用 `source:update-all` IPC 接口

2. **更新过程**
   - `SourceService.updateAll()` 遍历所有 RSS 源
   - 对每个源调用 `fetchFeed()`
   - 触发 `source:update-progress` 事件更新进度

3. **抓取文章**
   - 使用标准 RSS 解析器或自定义解析脚本
   - 发现新文章时触发 `article:discovered` 事件
   - `ArticleService` 监听事件并创建文章记录
   - 触发 `article:created` 事件

4. **完成更新**
   - 触发 `source:update-complete` 事件
   - 更新源的 `last_updated` 时间戳

---

### 文章嵌入流程

1. **文章创建**
   - 新文章创建时触发 `article:created` 事件
   - `VectorService` 监听事件并将文章加入队列

2. **队列处理**
   - 触发 `embedding:queued` 事件
   - 根据并发设置处理队列中的文章

3. **生成嵌入**
   - 调用 `generateEmbedding()` 生成向量
   - 支持多种提供商（OpenAI、Ollama、本地模型）
   - 本地模型使用 Worker 线程计算

4. **存储向量**
   - 将向量存储到 LanceDB
   - 更新文章的 `embedding_status` 为 `completed`

5. **完成处理**
   - 触发 `embedding:success` 或 `embedding:error` 事件
   - 继续处理队列中的下一篇文章

---

### 洞察生成流程

#### 每日洞察

1. **获取文章**
   - 获取最近 24 小时的文章

2. **生成摘要**
   - 使用 LLM 生成关键主题和趋势摘要
   - 推荐值得阅读的文章

3. **保存结果**
   - 存储到 `daily_insights` 表
   - 触发 `insight:generated` 事件

#### 主题洞察

1. **搜索相关文章**
   - 使用向量搜索获取相关文章

2. **生成洞察**
   - 使用 LLM 生成综合洞察报告
   - 突出关键发现、冲突观点和未来方向

3. **保存结果**
   - 存储到 `topic_insights` 表
   - 触发 `insight:generated` 事件

---

### 智能对话流程

1. **用户提问**
   - 用户在聊天界面输入问题

2. **向量搜索**
   - 使用问题作为查询进行向量搜索
   - 获取相关文章作为上下文

3. **构建提示**
   - 将搜索结果作为上下文
   - 构建系统提示词

4. **调用 LLM**
   - 使用 `main_chat` 模型生成回答
   - 支持流式输出

5. **保存对话**
   - 将对话保存到 `chat_history` 表

---

## 附录

### 环境变量

- `VITE_DEV_SERVER_URL`: 开发服务器 URL

### 数据目录

- **开发环境**: `.dev-data/`
- **生产环境**: `app.getPath('userData')`

### 日志

应用启动时会输出数据库初始化信息：
- 运行模式（开发/生产）
- SQLite 数据库路径
- LanceDB 数据库路径

### 错误处理

主进程捕获未处理的异常和拒绝：
- `uncaughtException`: 显示错误对话框（生产环境）
- `unhandledRejection`: 记录错误日志

---

*文档生成时间: 2026-01-08*