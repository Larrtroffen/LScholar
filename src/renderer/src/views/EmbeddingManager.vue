<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { ElMessageBox, ElMessage } from 'element-plus';
import { useTaskStore } from '../store/task';
import { useConfigStore } from '../store/config';
import { storeToRefs } from 'pinia';
import { 
  Database,
  Play,
  RefreshCw,
  CheckCircle2,
  RotateCcw,
  Cpu,
  Globe,
  Loader2
} from 'lucide-vue-next';

const taskStore = useTaskStore();
const configStore = useConfigStore();

const { 
  embeddingStats: stats, 
  statsLoading: loading, 
  processing, 
  queueStatus 
} = storeToRefs(taskStore);

// 获取当前使用的嵌入模型
const currentModel = computed(() => {
  const assignment = configStore.assignments.find(a => a.function_type === 'embedding');
  if (!assignment) return null;
  return configStore.models.find(m => m.id === assignment.model_id);
});

// 重置向量数据库
const handleResetVectorTable = async () => {
  try {
    await ElMessageBox.confirm(
      '重置向量数据库将删除所有已嵌入的向量数据，需要重新进行嵌入。是否继续？',
      '确认重置',
      {
        confirmButtonText: '确认重置',
        cancelButtonText: '取消',
        type: 'warning',
      }
    );
    await taskStore.resetVectorTable();
  } catch (error: any) {
    // 取消不处理
  }
};

// 批量嵌入
const handleBatchEmbed = async (feedId: number) => {
  if (!currentModel.value) {
    ElMessage.warning('请先在设置页面配置嵌入模型');
    return;
  }
  await taskStore.queueFeed(feedId);
};

// 刷新统计
const refreshStats = async () => {
  await taskStore.fetchStats();
};

onMounted(async () => {
  await configStore.fetchModels();
  await configStore.fetchAssignments();
  await taskStore.fetchStats();
  taskStore.initListeners();
});

const getProgressColor = (percent: number) => {
  if (percent === 100) return 'bg-green-500';
  if (percent >= 50) return 'bg-blue-500';
  if (percent >= 25) return 'bg-yellow-500';
  return 'bg-red-500';
};
</script>

<template>
  <div class="p-10 h-full overflow-y-auto custom-scrollbar bg-[var(--bg-main)]">
    <div class="max-w-6xl mx-auto">
      <!-- Header -->
      <header class="mb-8">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-[var(--accent)]/10 rounded-xl flex items-center justify-center text-[var(--accent)]">
              <Database :size="20" />
            </div>
            <div>
              <h1 class="text-2xl font-bold text-[var(--text-main)]">嵌入管理</h1>
              <p class="text-sm text-[var(--text-muted)]">管理文献向量化进度与状态</p>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <button 
              @click="handleResetVectorTable"
              class="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl text-sm font-bold transition-all"
            >
              <RotateCcw :size="16" />
              重置向量库
            </button>
            <button 
              @click="refreshStats"
              :disabled="loading"
              class="flex items-center gap-2 px-4 py-2 bg-[var(--bg-card)] hover:bg-[var(--bg-main)] border border-[var(--border)] rounded-xl text-sm font-semibold transition-all"
            >
              <RefreshCw :size="16" :class="{ 'animate-spin': loading }" />
              刷新
            </button>
          </div>
        </div>
      </header>

      <!-- Current Model Info -->
      <div class="mb-8 bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6 flex items-center justify-between shadow-sm">
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 rounded-xl flex items-center justify-center text-2xl bg-[var(--bg-main)] border border-[var(--border)]">
            <Cpu v-if="currentModel?.provider === 'local'" class="text-purple-500" :size="24" />
            <Globe v-else class="text-blue-500" :size="24" />
          </div>
          <div>
            <h3 class="text-base font-bold text-[var(--text-main)]">
              {{ currentModel ? currentModel.name : '未配置嵌入模型' }}
            </h3>
            <p class="text-xs text-[var(--text-muted)] flex items-center gap-2">
              <span v-if="currentModel" class="px-1.5 py-0.5 rounded bg-[var(--bg-main)] border border-[var(--border)] font-mono">
                {{ currentModel.model_name }}
              </span>
              <span v-if="currentModel?.provider === 'local'" class="text-purple-500 font-bold">本地模型</span>
              <span v-else-if="currentModel" class="text-blue-500 font-bold">远程 API</span>
              <span v-else class="text-red-500">请前往设置页面配置</span>
            </p>
          </div>
        </div>
        
        <!-- Queue Status -->
        <div class="flex items-center gap-6 px-6 py-3 bg-[var(--bg-main)]/50 rounded-xl border border-[var(--border)]">
          <div class="text-center">
            <p class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1">队列状态</p>
            <div class="flex items-center gap-2 justify-center">
              <div class="w-2 h-2 rounded-full" :class="queueStatus.queueLength > 0 ? 'bg-green-500 animate-pulse' : 'bg-gray-400'"></div>
              <span class="text-sm font-bold text-[var(--text-main)]">{{ queueStatus.queueLength > 0 ? '运行中' : '空闲' }}</span>
            </div>
          </div>
          <div class="w-px h-8 bg-[var(--border)]"></div>
          <div class="text-center">
            <p class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1">待处理任务</p>
            <span class="text-sm font-bold text-[var(--text-main)]">{{ queueStatus.queueLength }}</span>
          </div>
        </div>
      </div>

      <!-- Feed List -->
      <div class="space-y-6">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-lg font-bold text-[var(--text-main)]">订阅源进度</h3>
        </div>

        <div v-if="loading && stats.length === 0" class="flex flex-col items-center justify-center py-12">
          <Loader2 class="w-8 h-8 text-[var(--accent)] animate-spin mb-2" />
          <p class="text-sm text-[var(--text-muted)]">加载中...</p>
        </div>

        <div v-else-if="stats.length === 0" class="flex flex-col items-center justify-center py-12 bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl text-[var(--text-muted)]">
          <Database :size="40" class="mb-3 opacity-20" />
          <p class="text-sm font-medium">暂无数据</p>
        </div>

        <div v-else class="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-[var(--border)] bg-[var(--bg-main)]/50">
                <th class="p-4 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">订阅源</th>
                <th class="p-4 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider w-64">进度</th>
                <th class="p-4 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider w-24 text-right">操作</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[var(--border)]">
              <tr v-for="stat in stats" :key="stat.feedId" class="group hover:bg-[var(--bg-main)]/30 transition-colors">
                <td class="p-4">
                  <div class="font-bold text-[var(--text-main)] mb-1">{{ stat.feedName }}</div>
                  <div class="text-xs text-[var(--text-muted)]">
                    {{ stat.embedded }} / {{ stat.total }} 篇已嵌入
                  </div>
                </td>
                <td class="p-4">
                  <div class="flex items-center gap-3">
                    <div class="flex-1 h-2 bg-[var(--bg-main)] rounded-full overflow-hidden border border-[var(--border)]">
                      <div 
                        class="h-full transition-all duration-500"
                        :class="getProgressColor(stat.percent)"
                        :style="{ width: `${stat.percent}%` }"
                      ></div>
                    </div>
                    <span class="text-xs font-bold w-8 text-right">{{ stat.percent }}%</span>
                  </div>
                </td>
                <td class="p-4 text-right">
                  <button 
                    @click="handleBatchEmbed(stat.feedId)"
                    :disabled="processing || stat.percent === 100"
                    class="inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all"
                    :class="[
                      stat.percent === 100 
                        ? 'text-green-500 bg-green-500/10 cursor-default' 
                        : 'text-[var(--accent)] bg-[var(--accent)]/10 hover:bg-[var(--accent)] hover:text-white'
                    ]"
                    :title="stat.percent === 100 ? '已完成' : '开始嵌入'"
                  >
                    <CheckCircle2 v-if="stat.percent === 100" :size="16" />
                    <Play v-else :size="16" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  @apply bg-[var(--border)] rounded-full;
}
</style>
