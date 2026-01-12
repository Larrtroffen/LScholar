import { defineStore } from 'pinia';
import { Article, RSSFeed, FeedGroup } from '../../../shared/types';

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
    updateProgress: { current: 0, total: 0 },
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
    jumpToArticle(item: any) {
      if (item.url) {
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
    async fetchArticles(limit = 100, offset = 0) {
      this.isLoading = true;
      try {
        this.articles = await (window as any).electron.ipcRenderer.invoke('article:get-all', limit, offset);
      } finally {
        this.isLoading = false;
      }
    },
    async searchArticles(query: string) {
      this.isLoading = true;
      try {
        this.articles = await (window as any).electron.ipcRenderer.invoke('article:search', query);
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
          // We need to extend Article type or use any for now if types are not updated
          (article as any).trans_title = result.trans_title;
          (article as any).trans_abstract = result.trans_abstract;
        }
        if (this.selectedArticle && this.selectedArticle.id === id) {
          (this.selectedArticle as any).trans_title = result.trans_title;
          (this.selectedArticle as any).trans_abstract = result.trans_abstract;
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
