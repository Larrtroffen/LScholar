import { defineStore } from 'pinia';
import { AppSettings, AIModel, ModelAssignment, FunctionType } from '../../../shared/types';

export const useConfigStore = defineStore('config', {
  state: () => ({
    settings: {
      theme: 'system',
      language: 'zh-CN',
      auto_update_on_launch: true,
      max_concurrent_tasks: 2,
      user_preferences: ''
    } as AppSettings,
    models: [] as AIModel[],
    assignments: [] as ModelAssignment[],
    currentView: 'dashboard'
  }),
  actions: {
    async fetchSettings() {
      this.settings = await (window as any).electron.ipcRenderer.invoke('config:get-settings');
      this.applyTheme(this.settings.theme);
    },
    async updateSettings(settings: Partial<AppSettings>) {
      this.settings = await (window as any).electron.ipcRenderer.invoke('config:update-settings', settings);
      this.applyTheme(this.settings.theme);
    },
    async fetchModels() {
      this.models = await (window as any).electron.ipcRenderer.invoke('model:get-all');
    },
    async addModel(model: Omit<AIModel, 'id'>) {
      await (window as any).electron.ipcRenderer.invoke('model:add', model);
      await this.fetchModels();
    },
    async updateModel(id: number, model: Partial<AIModel>) {
      await (window as any).electron.ipcRenderer.invoke('model:update', id, model);
      await this.fetchModels();
    },
    async deleteModel(id: number) {
      await (window as any).electron.ipcRenderer.invoke('model:delete', id);
      await this.fetchModels();
    },
    async testModel(model: AIModel) {
      return await (window as any).electron.ipcRenderer.invoke('model:test', model);
    },
    async fetchAssignments() {
      console.log('[ConfigStore] fetchAssignments called');
      this.assignments = await (window as any).electron.ipcRenderer.invoke('config:get-assignments');
      console.log('[ConfigStore] Assignments loaded:', this.assignments);
    },
    async setAssignment(type: FunctionType | string, modelId: number | null) {
      console.log('[ConfigStore] setAssignment called:', type, 'modelId:', modelId);
      try {
        await (window as any).electron.ipcRenderer.invoke('config:set-assignment', type, modelId);
        console.log('[ConfigStore] setAssignment IPC success');
        
        // 手动刷新 assignments 以避免事件循环问题
        await this.fetchAssignments();
        console.log('[ConfigStore] Assignments refreshed after save');
      } catch (error) {
        console.error('[ConfigStore] setAssignment error:', error);
        throw error;
      }
    },
    applyTheme(theme: string) {
      const root = document.documentElement;
      if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    },
    toggleTheme() {
      const newTheme = this.settings.theme === 'dark' ? 'light' : 'dark';
      this.updateSettings({ theme: newTheme });
    },
    navigateTo(view: string) {
      this.currentView = view;
    },
    initTheme() {
      // Handled by fetchSettings
    },
    initEventListeners() {
      // 使用防抖机制来避免事件循环，同时保持多窗口数据同步
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;
      let lastUpdateTime = 0;
      
      (window as any).electron.ipcRenderer.on('config:updated', () => {
        console.log('[ConfigStore] config:updated event received');
        
        // 防抖：如果距离上次更新不到 500ms，则忽略
        const now = Date.now();
        if (now - lastUpdateTime < 500) {
          console.log('[ConfigStore] Ignoring event (debounce)');
          return;
        }
        
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        
        debounceTimer = setTimeout(() => {
          lastUpdateTime = Date.now();
          // 刷新模型分配数据以保持多窗口同步
          this.fetchAssignments();
          console.log('[ConfigStore] Assignments refreshed after config:updated');
        }, 100);
      });
      
      // 监听模型更新事件
      (window as any).electron.ipcRenderer.on('model:updated', () => {
        console.log('[ConfigStore] model:updated event received');
        this.fetchModels();
      });
    }
  }
});
