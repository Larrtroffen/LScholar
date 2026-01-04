<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { 
  Sparkles, 
  TrendingUp, 
  Calendar as CalendarIcon, 
  BookOpen,
  ArrowUpRight,
  Lightbulb,
  Zap,
  BrainCircuit,
  Inbox,
  RefreshCw,
  Settings2,
  UserCircle,
  Save,
  ChevronDown,
  ChevronUp
} from 'lucide-vue-next';
import { ElMessage } from 'element-plus';
import { useMainStore } from '../store';

const store = useMainStore();
const selectedDate = ref(new Date());
const loading = ref(false);
const rerunning = ref(false);
const savingPreferences = ref(false);
const showPreferences = ref(true);
const insightData = ref<any>(null);
const recommendationCount = ref(10);

// 监听日期变化
watch(selectedDate, () => {
  fetchInsights();
});

const fetchInsights = async () => {
  loading.value = true;
  try {
    const dateStr = selectedDate.value.toISOString().split('T')[0];
    const data = await (window as any).electron.ipcRenderer.invoke('get-insights', dateStr);
    if (data) {
      insightData.value = {
        summary: data.summary_text,
        recommendations: JSON.parse(data.recommendations_json)
      };
    } else {
      insightData.value = null;
    }
  } catch (error) {
    console.error('Fetch insights failed:', error);
    insightData.value = null;
  } finally {
    loading.value = false;
  }
};

const rerunInsights = async () => {
  rerunning.value = true;
  try {
    const dateStr = selectedDate.value.toISOString().split('T')[0];
    await (window as any).electron.ipcRenderer.invoke('rerun-insights', { 
      count: recommendationCount.value,
      date: dateStr
    });
    await fetchInsights();
    ElMessage.success('洞察已重新生成');
  } catch (error: any) {
    ElMessage.error(`生成失败: ${error.message}`);
  } finally {
    rerunning.value = false;
  }
};

const savePreferences = async () => {
  savingPreferences.value = true;
  try {
    await (window as any).electron.ipcRenderer.invoke('save-settings', { ...store.settings });
    ElMessage.success('研究偏好已保存');
  } catch (error: any) {
    ElMessage.error(`保存失败: ${error.message}`);
  } finally {
    savingPreferences.value = false;
  }
};

const openExternal = (url: string) => {
  if (url && url.startsWith('http')) {
    (window as any).electron.shell.openExternal(url);
  } else {
    ElMessage.warning('无效的链接地址');
  }
};

onMounted(async () => {
  await store.fetchSettings();
  fetchInsights();
});
</script>

<template>
  <div class="p-10 h-full overflow-y-auto custom-scrollbar bg-[var(--bg-main)]">
    <div class="max-w-6xl mx-auto">
      <header class="flex justify-between items-center mb-8">
        <div>
          <h1 class="text-2xl font-bold text-[var(--text-main)] mb-1">每日洞察</h1>
          <p class="text-xs text-[var(--text-muted)] font-medium uppercase tracking-widest">AI-Powered Academic Intelligence</p>
        </div>
        <div class="flex items-center gap-4">
          <el-button @click="rerunInsights" :loading="rerunning" class="!h-10 !px-5 !rounded-xl !text-xs !font-bold !bg-[var(--bg-card)] !border-[var(--border)] !text-[var(--text-main)]">
            <RefreshCw :size="16" class="mr-2" :class="rerunning ? 'animate-spin' : ''" /> 重新生成
          </el-button>
          <div class="flex items-center gap-3 bg-[var(--bg-card)] px-5 py-2.5 rounded-xl border border-[var(--border)] shadow-sm text-[var(--text-main)]">
            <CalendarIcon :size="16" class="text-[var(--accent)]" />
            <span class="text-sm font-bold">{{ selectedDate.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }) }}</span>
          </div>
        </div>
      </header>

      <!-- Research Preferences Section -->
      <section class="mb-8 bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm">
        <div 
          @click="showPreferences = !showPreferences"
          class="p-4 px-6 flex items-center justify-between cursor-pointer hover:bg-[var(--bg-main)]/50 transition-colors"
        >
          <div class="flex items-center gap-3">
            <UserCircle :size="18" class="text-[var(--accent)]" />
            <h2 class="text-sm font-bold text-[var(--text-main)] uppercase tracking-widest">研究偏好与配置</h2>
          </div>
          <component :is="showPreferences ? ChevronUp : ChevronDown" :size="18" class="text-[var(--text-muted)]" />
        </div>
        
        <Transition name="fade">
          <div v-if="showPreferences" class="p-6 pt-2 border-t border-[var(--border)] bg-[var(--bg-main)]/20">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div class="space-y-3">
                <div class="flex justify-between items-center">
                  <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest ml-1">关键词 (AI 将优先关注这些领域)</label>
                  <el-button 
                    @click="savePreferences" 
                    :loading="savingPreferences"
                    type="primary" 
                    link
                    class="!text-[10px] !font-bold uppercase tracking-widest"
                  >
                    <Save :size="12" class="mr-1" /> 保存偏好
                  </el-button>
                </div>
                <el-input 
                  v-model="store.settings.user_preferences" 
                  type="textarea" 
                  :rows="3" 
                  placeholder="例如：Deep Learning, NLP, Robotics..." 
                  class="custom-textarea"
                />
              </div>
              
              <div class="space-y-4">
                <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest ml-1">推荐文章数量 (10 - 50)</label>
                <div class="flex items-center gap-6 bg-[var(--bg-card)] p-4 rounded-xl border border-[var(--border)]">
                  <el-slider 
                    v-model="recommendationCount" 
                    :min="10" 
                    :max="50" 
                    :step="5"
                    class="flex-1"
                  />
                  <span class="text-lg font-mono font-bold text-[var(--accent)] w-8 text-right">{{ recommendationCount }}</span>
                </div>
                <p class="text-[9px] text-[var(--text-muted)] italic ml-1">* 增加数量会消耗更多 Token 并延长生成时间</p>
              </div>
            </div>
          </div>
        </Transition>
      </section>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <!-- Calendar Column -->
        <div class="lg:col-span-4">
          <div class="bg-[var(--bg-card)] p-6 rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden">
            <el-calendar v-model="selectedDate" class="custom-calendar" />
            
            <div class="mt-6 p-5 bg-blue-500/5 border border-blue-500/10 rounded-xl">
              <div class="flex items-center gap-2 text-[var(--accent)] mb-2">
                <Lightbulb :size="16" />
                <span class="text-[10px] font-bold uppercase tracking-widest">智能提示</span>
              </div>
              <p class="text-xs text-[var(--text-muted)] leading-relaxed font-medium">
                点击日历日期查看历史总结。系统每日凌晨自动分析新文献。
              </p>
            </div>
          </div>
        </div>

        <!-- Insights Column -->
        <div class="lg:col-span-8 space-y-8">
          <div v-if="loading" class="flex flex-col items-center justify-center h-64 opacity-50">
            <div class="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin"></div>
            <p class="text-xs font-bold mt-4 uppercase tracking-widest text-[var(--text-muted)]">正在生成洞察...</p>
          </div>

          <template v-else-if="insightData">
            <!-- AI Summary Card -->
            <section class="bg-gradient-to-br from-blue-500/10 via-[var(--bg-card)] to-[var(--bg-card)] p-8 rounded-3xl border border-[var(--border)] relative overflow-hidden shadow-lg group">
              <Sparkles class="absolute top-6 right-6 text-[var(--accent)] opacity-20" :size="48" />
              
              <div class="flex items-center gap-3 mb-6">
                <div class="w-10 h-10 bg-[var(--accent)] rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                  <BrainCircuit :size="20" />
                </div>
                <h2 class="text-lg font-bold text-[var(--text-main)]">今日 AI 总结</h2>
              </div>
              
              <p class="text-[var(--text-main)] leading-relaxed text-base font-medium">
                {{ insightData.summary }}
              </p>
            </section>

            <!-- Recommendations -->
            <section>
              <div class="flex items-center justify-between mb-6 px-2">
                <h2 class="text-lg font-bold text-[var(--text-main)] flex items-center gap-3">
                  <TrendingUp :size="20" class="text-[var(--success)]" /> 为你推荐
                </h2>
              </div>
              
              <div class="space-y-4">
                <div 
                  v-for="(item, index) in insightData.recommendations" 
                  :key="index"
                  @click="openExternal(item.url)"
                  class="bg-[var(--bg-card)] p-6 rounded-2xl border border-[var(--border)] hover:border-[var(--accent)]/50 transition-all flex justify-between items-center group cursor-pointer shadow-sm"
                >
                  <div class="flex-1 pr-8">
                    <div class="flex items-center gap-3 mb-2">
                      <span 
                        class="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest"
                        :class="item.type === '强相关' ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'"
                      >
                        {{ item.type }}
                      </span>
                      <span class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{{ item.journal }}</span>
                      <span class="text-[10px] font-bold text-[var(--accent)] uppercase tracking-widest">匹配度 {{ (item.score * 100).toFixed(0) }}%</span>
                    </div>
                    <h3 class="text-base font-bold text-[var(--text-main)] group-hover:text-[var(--accent)] transition-colors leading-snug">{{ item.title }}</h3>
                  </div>
                  <div class="w-10 h-10 bg-[var(--bg-main)] rounded-xl flex items-center justify-center text-[var(--text-muted)] group-hover:bg-[var(--accent)] group-hover:text-white transition-all shadow-inner">
                    <ArrowUpRight :size="20" />
                  </div>
                </div>
              </div>
            </section>
          </template>

          <div v-else class="flex flex-col items-center justify-center h-96 text-[var(--text-muted)] bg-[var(--bg-card)] rounded-3xl border border-[var(--border)] border-dashed">
            <Inbox :size="48" class="mb-4 opacity-10" />
            <h3 class="text-base font-bold uppercase tracking-widest">暂无洞察数据</h3>
            <p class="text-xs mt-2">该日期没有新增文献或尚未生成 AI 总结</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
:deep(.el-calendar) {
  --el-calendar-bg-color: transparent;
  --el-calendar-border: none;
}

:deep(.el-calendar-table thead th) {
  color: var(--text-muted);
  font-weight: 700;
  font-size: 10px;
  padding: 12px 0;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

/* 彻底修复日历显示问题 */
:deep(.el-calendar-table) {
  background-color: transparent !important;
}

:deep(.el-calendar-table td) {
  border: none !important;
  background-color: transparent !important;
  padding: 2px !important;
}

:deep(.el-calendar-table .el-calendar-day) {
  height: 38px !important;
  padding: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  font-size: 12px !important;
  font-weight: 600 !important;
  color: var(--text-main) !important;
  border-radius: 8px !important;
  transition: all 0.2s !important;
  margin: 0 !important;
  position: relative !important;
  z-index: 1 !important;
  background-color: transparent !important;
  border: 1px solid transparent !important;
}

:deep(.el-calendar-table .el-calendar-day:hover) {
  background-color: rgba(59, 130, 246, 0.1) !important;
  color: var(--accent) !important;
}

:deep(.el-calendar-table td.is-selected .el-calendar-day) {
  background-color: var(--accent) !important;
  color: white !important;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3) !important;
  border: 1px solid var(--accent) !important;
}

:deep(.el-calendar-table td.is-today .el-calendar-day) {
  color: #f59e0b !important; /* 使用琥珀色区分今日 */
  border: 1px solid #f59e0b !important;
  background-color: rgba(245, 158, 11, 0.05) !important;
}

:deep(.el-calendar-table td.is-today.is-selected .el-calendar-day) {
  background-color: var(--accent) !important;
  color: white !important;
  border: 1px solid #f59e0b !important; /* 选中今日时保留今日边框 */
}

:deep(.el-calendar__header) {
  border-bottom: 1px solid var(--border);
  padding: 0 0 16px 0;
  margin-bottom: 16px;
}

:deep(.el-calendar__title) {
  color: var(--text-main);
  font-weight: 700;
  font-size: 14px;
}

:deep(.el-calendar__button-group) {
  display: none;
}

.custom-textarea :deep(.el-textarea__inner) {
  @apply !bg-[var(--bg-main)] !border-[var(--border)] !rounded-xl !text-sm !text-[var(--text-main)] !p-4;
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
