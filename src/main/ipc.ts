import { ipcMain, BrowserWindow } from 'electron';
import { configService } from './services/ConfigService';
import { modelService } from './services/ModelService';
import { sourceService } from './services/SourceService';
import { articleService } from './services/ArticleService';
import { vectorService } from './services/VectorService';
import { insightService } from './services/InsightService';
import { llmService } from './services/LLMService';
import { chatService } from './services/ChatService';
import { eventBus } from './events';

export function setupIpc() {
  // Config
  ipcMain.handle('config:get-settings', () => configService.getSettings());
  ipcMain.handle('config:update-settings', (_, settings) => configService.updateSettings(settings));
  ipcMain.handle('config:get-assignments', () => configService.getAllAssignments());
  ipcMain.handle('config:set-assignment', (_, type, modelId) => configService.setAssignment(type, modelId));

  // Models
  ipcMain.handle('model:get-all', () => modelService.getAll());
  ipcMain.handle('model:add', (_, model) => modelService.add(model));
  ipcMain.handle('model:update', (_, id, model) => modelService.update(id, model));
  ipcMain.handle('model:delete', (_, id) => modelService.delete(id));
  ipcMain.handle('model:test', (_, model) => modelService.testConnection(model));

  // Sources / Feeds
  ipcMain.handle('source:get-all', () => sourceService.getAllFeeds());
  ipcMain.handle('source:get-groups', () => sourceService.getGroups());
  ipcMain.handle('source:add', (_, feed) => sourceService.addFeed(feed));
  ipcMain.handle('source:update', (_, id, feed) => sourceService.updateFeed(id, feed));
  ipcMain.handle('source:delete', (_, id) => sourceService.deleteFeed(id));
  ipcMain.handle('source:update-all', () => sourceService.updateAll());
  ipcMain.handle('source:update-single', async (_, id) => {
    const feed = sourceService.getAllFeeds().find(f => f.id === id);
    if (feed) {
      await sourceService.fetchFeed(feed);
    }
  });
  ipcMain.handle('source:generate-script', (_, url) => sourceService.generateScript(url));
  ipcMain.handle('fetch-raw-rss', (_, url) => sourceService.fetchRawRss(url));

  // Articles
  ipcMain.handle('article:get-all', (_, limit, offset) => articleService.getAll(limit, offset));
  ipcMain.handle('article:search', (_, query) => articleService.search(query));
  ipcMain.handle('article:mark-read', (_, id, isRead) => articleService.markRead(id, isRead));
  ipcMain.handle('article:toggle-favorite', (_, id) => articleService.toggleFavorite(id));
  ipcMain.handle('article:translate', (_, id) => articleService.translateArticle(id));
  ipcMain.handle('export-to-ris', (_, ids) => articleService.exportToRis(ids));

  // Vector / Search
  ipcMain.handle('vector:search', (_, query) => vectorService.search(query));
  ipcMain.handle('vector:reset', () => vectorService.reset());
  ipcMain.handle('vector:get-stats', () => vectorService.getStats());
  ipcMain.handle('vector:queue-feed', (_, feedId) => vectorService.queueFeed(feedId));

  // Insights
  ipcMain.handle('insight:generate-daily', () => insightService.generateDailyInsight());
  ipcMain.handle('insight:generate-topic', (_, topic) => insightService.generateTopicInsight(topic));
  ipcMain.handle('generate-smart-extraction', (_, params) => insightService.generateSmartExtraction(params));
  ipcMain.handle('get-topic-insights', () => insightService.getAllTopicInsights());
  ipcMain.handle('delete-topic-insight', (_, id) => insightService.deleteTopicInsight(id));
  ipcMain.handle('rename-topic-insight', (_, { id, title }) => insightService.renameTopicInsight(id, title));
  ipcMain.handle('get-insights', (_, date) => insightService.getDailyInsight(date));

  // LLM Chat
  ipcMain.handle('llm:chat', (_, type, messages, options) => llmService.chat(type, messages, options));
  ipcMain.handle('ask-ai', (_, { question }) => chatService.askAI(question));
  ipcMain.handle('get-chat-history', () => chatService.getAllChats());
  ipcMain.handle('save-chat', (_, { id, title, messages }) => chatService.saveChat(id, title, messages));
  ipcMain.handle('delete-chat', (_, id) => chatService.deleteChat(id));

  // Forward events to renderer
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

  eventsToForward.forEach(eventName => {
    eventBus.on(eventName as any, (payload) => {
      // Broadcast to all windows
      BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send(eventName, payload);
      });
    });
  });
}
