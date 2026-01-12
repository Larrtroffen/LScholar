import { defineStore } from 'pinia';
import { AppSettings, AIModel, ModelAssignment } from '../../../shared/types';

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
      this.assignments = await (window as any).electron.ipcRenderer.invoke('config:get-assignments');
    },
    async setAssignment(type: string, modelId: number | null) {
      await (window as any).electron.ipcRenderer.invoke('config:set-assignment', type, modelId);
      // 不需要重新 fetchAssignments，因为 IPC 调用会触发 config:updated 事件
      // 事件监听器会自动更新 assignments
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
    initTheme() {
      // Handled by fetchSettings
    },
    initEventListeners() {
      // 监听 config:updated 事件，自动更新 assignments
      (window as any).electron.ipcRenderer.on('config:updated', async () => {
        console.log('[ConfigStore] config:updated event received, fetching assignments...');
        await this.fetchAssignments();
        console.log('[ConfigStore] Assignments updated:', this.assignments);
      });
    }
  }
});
