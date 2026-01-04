import { defineStore } from 'pinia';

export const useMainStore = defineStore('main', {
  state: () => ({
    theme: 'dark',
    settings: {
      llm_base_url: '',
      llm_api_key: '',
      llm_model_name: '',
      embedding_model_name: '',
      rerank_model_name: '',
      proxy_url: '',
      user_preferences: '',
      translation_enabled: false,
      translation_mode: 'append',
      trans_llm_base_url: '',
      trans_llm_api_key: '',
      trans_llm_model_name: ''
    },
    feeds: [] as any[],
    updatingFeedIds: [] as number[],
    isUpdatingAll: false,
    updateProgress: { current: 0, total: 0, percent: 0 },
    groups: [] as any[],
    articles: [] as any[],
    selectedArticle: null as any,
    chatHistory: [] as any[],
    tokenUsage: {
      today: 0,
      month: 0
    }
  }),
  actions: {
    async fetchSettings() {
      this.settings = await (window as any).electron.ipcRenderer.invoke('get-settings');
    },
    async fetchFeeds() {
      this.feeds = await (window as any).electron.ipcRenderer.invoke('get-feeds');
    },
    async updateSingleFeed(feedId: number) {
      if (this.updatingFeedIds.includes(feedId)) return;
      this.updatingFeedIds.push(feedId);
      try {
        await (window as any).electron.ipcRenderer.invoke('update-feed-data', feedId);
        await this.fetchFeeds();
      } finally {
        this.updatingFeedIds = this.updatingFeedIds.filter(id => id !== feedId);
      }
    },
    async updateAllFeeds() {
      if (this.isUpdatingAll) return;
      this.isUpdatingAll = true;
      this.updateProgress = { current: 0, total: this.feeds.length, percent: 0 };
      
      const removeListener = (window as any).electron.ipcRenderer.on('update-progress', (_event: any, progress: any) => {
        this.updateProgress = progress;
      });

      try {
        await (window as any).electron.ipcRenderer.invoke('update-all-feeds');
        await this.fetchFeeds();
      } finally {
        this.isUpdatingAll = false;
        removeListener();
      }
    },
    async fetchGroups() {
      this.groups = await (window as any).electron.ipcRenderer.invoke('get-groups');
    },
    async addGroup(name: string) {
      await (window as any).electron.ipcRenderer.invoke('add-group', name);
      await this.fetchGroups();
    },
    async fetchArticles(params: any) {
      this.articles = await (window as any).electron.ipcRenderer.invoke('get-articles', params);
    },
    async fetchChatHistory() {
      this.chatHistory = await (window as any).electron.ipcRenderer.invoke('get-chat-history');
    },
    toggleTheme() {
      this.theme = this.theme === 'dark' ? 'light' : 'dark';
      if (this.theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      localStorage.setItem('theme', this.theme);
    },
    initTheme() {
      const saved = localStorage.getItem('theme') || 'dark';
      this.theme = saved;
      if (saved === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }
});
