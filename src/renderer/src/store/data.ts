import { defineStore } from 'pinia';
import { Article, RSSFeed, FeedGroup } from '../../../shared/types';
import { useConfigStore } from './config';

export const useDataStore = defineStore('data', {
  state: () => ({
    articles: [] as Article[],
    feeds: [] as RSSFeed[],
    groups: [] as FeedGroup[],
    selectedArticle: null as Article | null,
    totalArticles: 0,
    isLoading: false,
    translatingIds: [] as number[],
    isUpdatingAll: false,
    updateProgress: { current: 0, total: 0, percent: 0, message: '' },
    updatingFeedIds: [] as number[],
    chatHistory: [] as any[],
    topicInsights: [] as any[]
  }),
  actions: {
    async fetchFeeds() {
      this.feeds = await (window as any).electron.ipcRenderer.invoke('source:get-all');
    },
    async fetchChatHistory() {
      this.chatHistory = await (window as any).electron.ipcRenderer.invoke('get-chat-history');
    },
    async fetchGroups() {
      this.groups = await (window as any).electron.ipcRenderer.invoke('source:get-groups');
    },
    async fetchTopicInsights() {
      this.topicInsights = await (window as any).electron.ipcRenderer.invoke('get-topic-insights');
    },
    async jumpToArticle(item: any) {
      const configStore = useConfigStore();
      
      // 优先通过 URL 查找本地文章
      let foundArticle: Article | null = null;
      if (item.url) {
        const article = await (window as any).electron.ipcRenderer.invoke('article:find-by-url', item.url);
        if (article) {
          foundArticle = article;
        }
      }
      
      // 如果通过 URL 找不到，尝试通过标题查找
      if (!foundArticle && item.title) {
        const articles = await this.searchArticles(item.title);
        if (articles.length > 0) {
          foundArticle = articles[0];
        }
      }
      
      if (foundArticle) {
        // 切换到 Dashboard 视图并选中文章
        configStore.navigateTo('dashboard');
        this.selectArticle(foundArticle);
      } else if (item.url) {
        // 如果都找不到且有 URL，则打开外部浏览器
        window.open(item.url, '_blank');
      } else {
        console.warn('Article has no URL:', item);
      }
    },
    async updateAllFeeds() {
      this.isUpdatingAll = true;
      try {
        await (window as any).electron.ipcRenderer.invoke('source:update-all');
      } finally {
        this.isUpdatingAll = false;
      }
    },
    async updateSingleFeed(id: number) {
      if (this.updatingFeedIds.includes(id)) return;
      this.updatingFeedIds.push(id);
      try {
        await (window as any).electron.ipcRenderer.invoke('source:update-single', id);
      } finally {
        this.updatingFeedIds = this.updatingFeedIds.filter(fid => fid !== id);
      }
    },
    async addFeed(feed: Omit<RSSFeed, 'id'>) {
      await (window as any).electron.ipcRenderer.invoke('source:add', feed);
      await this.fetchFeeds();
    },
    async updateFeed(id: number, feed: Partial<RSSFeed>) {
      await (window as any).electron.ipcRenderer.invoke('source:update', id, feed);
      await this.fetchFeeds();
    },
    async deleteFeed(id: number) {
      await (window as any).electron.ipcRenderer.invoke('source:delete', id);
      await this.fetchFeeds();
    },
    async generateScript(url: string) {
      return await (window as any).electron.ipcRenderer.invoke('source:generate-script', url);
    },
    async fetchArticles(limit = 10000, offset = 0) {
      this.isLoading = true;
      try {
        this.articles = await (window as any).electron.ipcRenderer.invoke('article:get-all', limit, offset);
      } finally {
        this.isLoading = false;
      }
    },
    async searchArticles(query: string): Promise<Article[]> {
      this.isLoading = true;
      try {
        const results = await (window as any).electron.ipcRenderer.invoke('article:search', query);
        this.articles = results;
        return results;
      } finally {
        this.isLoading = false;
      }
    },
    async markRead(id: number, isRead: boolean) {
      await (window as any).electron.ipcRenderer.invoke('article:mark-read', id, isRead);
      const article = this.articles.find(a => a.id === id);
      if (article) article.is_read = isRead;
    },
    async toggleFavorite(id: number) {
      await (window as any).electron.ipcRenderer.invoke('article:toggle-favorite', id);
      const article = this.articles.find(a => a.id === id);
      if (article) article.is_favorite = !article.is_favorite;
    },
    async translateArticle(id: number) {
      if (this.translatingIds.includes(id)) return;
      this.translatingIds.push(id);
      try {
        const result = await (window as any).electron.ipcRenderer.invoke('article:translate', id);
        const article = this.articles.find(a => a.id === id);
        if (article) {
          article.trans_title = result.trans_title;
          article.trans_abstract = result.trans_abstract;
        }
        if (this.selectedArticle && this.selectedArticle.id === id) {
          this.selectedArticle.trans_title = result.trans_title;
          this.selectedArticle.trans_abstract = result.trans_abstract;
        }
      } finally {
        this.translatingIds = this.translatingIds.filter(tid => tid !== id);
      }
    },
    selectArticle(article: Article) {
      this.selectedArticle = article;
      if (!article.is_read) {
        this.markRead(article.id!, true);
      }
    }
  }
});
