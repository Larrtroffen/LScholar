import { defineStore } from 'pinia';
import { ElMessage } from 'element-plus';

interface EmbeddingStats {
  feedId: number;
  feedName: string;
  total: number;
  embedded: number;
  percent: number;
}

export const useTaskStore = defineStore('task', {
  state: () => ({
    updateProgress: { current: 0, total: 0, message: '' },
    isUpdating: false,
    embeddingQueue: [] as number[],
    embeddingStatus: {} as Record<number, 'pending' | 'completed' | 'failed'>,
    embeddingStats: [] as EmbeddingStats[],
    statsLoading: false,
    processing: false,
    queueStatus: { isProcessing: false, queueLength: 0 }
  }),
  actions: {
    initListeners() {
      const ipc = (window as any).electron.ipcRenderer;
      
      ipc.on('source:update-start', () => {
        this.isUpdating = true;
        this.updateProgress = { current: 0, total: 0, message: 'Starting update...' };
      });

      // preload 的 on 方法直接传递 payload，不传递 event 对象
      ipc.on('source:update-progress', (progress: any) => {
        this.updateProgress = { ...this.updateProgress, ...progress };
      });

      ipc.on('source:update-complete', () => {
        this.isUpdating = false;
        this.updateProgress = { current: 0, total: 0, message: 'Update complete' };
      });

      ipc.on('embedding:queued', ({ articleId }: { articleId: number }) => {
        if (!this.embeddingQueue.includes(articleId)) {
          this.embeddingQueue.push(articleId);
          this.embeddingStatus[articleId] = 'pending';
          this.queueStatus.queueLength++;
        }
      });

      ipc.on('embedding:success', ({ articleId }: { articleId: number }) => {
        this.embeddingQueue = this.embeddingQueue.filter(id => id !== articleId);
        this.embeddingStatus[articleId] = 'completed';
        this.queueStatus.queueLength = Math.max(0, this.queueStatus.queueLength - 1);
        this.fetchStats(false);
      });

      ipc.on('embedding:error', ({ articleId }: { articleId: number }) => {
        this.embeddingQueue = this.embeddingQueue.filter(id => id !== articleId);
        this.embeddingStatus[articleId] = 'failed';
        this.queueStatus.queueLength = Math.max(0, this.queueStatus.queueLength - 1);
      });
    },
    async triggerUpdateAll() {
      await (window as any).electron.ipcRenderer.invoke('source:update-all');
    },
    async fetchStats(showLoading = true) {
      if (showLoading) this.statsLoading = true;
      try {
        this.embeddingStats = await (window as any).electron.ipcRenderer.invoke('vector:get-stats');
      } finally {
        if (showLoading) this.statsLoading = false;
      }
    },
    async queueFeed(feedId: number) {
      try {
        await (window as any).electron.ipcRenderer.invoke('vector:queue-feed', feedId);
        ElMessage.success('已加入嵌入队列');
        this.processing = true;
      } catch (error: any) {
        ElMessage.error(`操作失败: ${error.message}`);
      }
    },
    async resetVectorTable() {
      try {
        await (window as any).electron.ipcRenderer.invoke('vector:reset');
        ElMessage.success('向量库已重置');
        await this.fetchStats();
      } catch (error: any) {
        ElMessage.error(`重置失败: ${error.message}`);
      }
    }
  }
});