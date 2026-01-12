<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { 
  Sparkles, 
  TrendingUp, 
  Calendar as CalendarIcon, 
  ArrowUpRight,
  BrainCircuit,
  Inbox,
  Wand2,
  Clock,
  Layers,
  Plus,
  History,
  Trash2,
  Edit3
} from 'lucide-vue-next';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useDataStore } from '../store/data';
import { useConfigStore } from '../store/config';
import ResearchPreferences from '../components/ResearchPreferences.vue';

const store = useDataStore();
const configStore = useConfigStore();
const dateRange = ref<[Date, Date]>([
  new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 最近一周
  new Date()
]);
const loading = ref(false);
const extractionData = ref<any>(null);
// 从偏好设置读取推荐数量
const getInitialRecommendationCount = () => {
  try {
    if (configStore.settings.user_preferences) {
      const prefs = JSON.parse(configStore.settings.user_preferences);
      return prefs.topic_insight_preferences?.recommendation_count || 
             prefs.recommendation_count || 15;
    }
  } catch {}
  return 15;
};
const recommendationCount = ref(getInitialRecommendationCount());
const selectedSources = ref<string[]>([]); // 格式: 'group:id' 或 'feed:id'
const currentInsightId = ref<number | null>(null);

const sourceOptions = computed(() => {
  const options: any[] = [
    {
      label: '文献分组',
      options: store.groups.map(g => ({ label: g.name, value: `group:${g.id}` }))
    },
    {
      label: '订阅源',
      options: store.feeds.map(f => ({ label: f.name || f.title, value: `feed:${f.id}` }))
    }
  ];
  return options;
});

const generateExtraction = async () => {
  if (!dateRange.value || dateRange.value.length !== 2) {
    ElMessage.warning('请选择日期范围');
    return;
  }

  loading.value = true;
  try {
    const startDate = dateRange.value[0].toISOString().split('T')[0];
    const endDate = dateRange.value[1].toISOString().split('T')[0];
    
    // 从用户偏好中正确提取 interests 数组
    let interests: string[] = [];
    try {
      if (configStore.settings.user_preferences) {
        const prefs = JSON.parse(configStore.settings.user_preferences);
        interests = prefs.topic_insight_preferences?.interests || prefs.interests || [];
      }
    } catch (e) {
      console.warn('[SmartExtraction] Failed to parse interests from preferences:', e);
    }
    
    // 构建参数对象，确保所有值都是可序列化的基本类型
    const params = {
      startDate,
      endDate,
      interests: Array.isArray(interests) ? interests : [],
      count: Number(recommendationCount.value) || 15,
      sources: Array.isArray(selectedSources.value) ? [...selectedSources.value] : []
    };
    
    // 通过 JSON 序列化确保参数可以正确传递
    const result = await (window as any).electron.ipcRenderer.invoke(
      'generate-smart-extraction', 
      JSON.parse(JSON.stringify(params))
    );

    if (result.success) {
      extractionData.value = result.data;
      currentInsightId.value = result.data.id;
      await store.fetchTopicInsights();
      ElMessage.success('洞察生成成功');
    }
  } catch (error: any) {
    console.error('Smart extraction failed:', error);
    ElMessage.error(`生成失败: ${error.message}`);
  } finally {
    loading.value = false;
  }
};

const selectHistory = (item: any) => {
  currentInsightId.value = item.id;
  const config = JSON.parse(item.config_json);
  dateRange.value = [new Date(config.startDate), new Date(config.endDate)];
  selectedSources.value = config.sources || [];
  recommendationCount.value = config.count || 15;
  
  extractionData.value = {
    id: item.id,
    title: item.title,
    summary: item.summary_text,
    recommendations: JSON.parse(item.recommendations_json)
  };
};

const deleteHistory = async (id: number) => {
  try {
    await ElMessageBox.confirm('确定要删除这条历史记录吗？', '提示', { type: 'warning' });
    await (window as any).electron.ipcRenderer.invoke('delete-topic-insight', id);
    if (currentInsightId.value === id) {
      createNew();
    }
    await store.fetchTopicInsights();
    ElMessage.success('已删除');
  } catch (e) {}
};

const renameHistory = async (item: any) => {
  try {
    const { value } = await ElMessageBox.prompt('请输入新标题', '重命名', {
      inputValue: item.title,
      inputPattern: /\S+/,
      inputErrorMessage: '标题不能为空'
    });
    await (window as any).electron.ipcRenderer.invoke('rename-topic-insight', { id: item.id, title: value });
    await store.fetchTopicInsights();
    if (currentInsightId.value === item.id) {
      extractionData.value.title = value;
    }
    ElMessage.success('已重命名');
  } catch (e) {}
};

const createNew = () => {
  currentInsightId.value = null;
  extractionData.value = null;
};

onMounted(async () => {
  await configStore.fetchSettings();
  await store.fetchFeeds();
  await store.fetchGroups();
  await store.fetchTopicInsights();
});
</script>

<template>
  <div class="flex h-full bg-[var(--bg-main)] overflow-hidden">
    <!-- Left Sidebar: History -->
    <div class="w-64 border-r border-[var(--border)] flex flex-col shrink-0 bg-[var(--bg-sidebar)]/30">
      <div class="p-6 border-b border-[var(--border)]">
        <el-button 
          type="primary" 
          class="w-full !h-10 !rounded-xl !font-bold shadow-lg shadow-blue-500/20"
          @click="createNew"
        >
          <Plus :size="18" class="mr-2" /> 新建专题
        </el-button>
      </div>
      
      <div class="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
        <div v-if="store.topicInsights.length === 0" class="flex flex-col items-center justify-center h-32 text-[var(--text-muted)] opacity-50">
          <History :size="24" class="mb-2" />
          <span class="text-[10px] font-bold uppercase tracking-widest">暂无历史记录</span>
        </div>
        
        <div 
          v-for="item in store.topicInsights" 
          :key="item.id"
          @click="selectHistory(item)"
          class="group p-3 rounded-xl cursor-pointer transition-all relative border border-transparent"
          :class="currentInsightId === item.id ? 'bg-blue-500/10 border-blue-500/20' : 'hover:bg-[var(--bg-card)]'"
        >
          <div class="flex flex-col gap-1 pr-8">
            <span class="text-xs font-bold text-[var(--text-main)] line-clamp-1" :class="currentInsightId === item.id ? 'text-blue-500' : ''">
              {{ item.title }}
            </span>
            <span class="text-[9px] text-[var(--text-muted)] font-medium uppercase tracking-tighter">
              {{ new Date(item.created_at).toLocaleDateString() }}
            </span>
          </div>
          
          <div class="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button @click.stop="renameHistory(item)" class="p-1 hover:text-blue-500 transition-colors">
              <Edit3 :size="12" />
            </button>
            <button @click.stop="deleteHistory(item.id)" class="p-1 hover:text-red-500 transition-colors">
              <Trash2 :size="12" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <div class="flex-1 overflow-y-auto custom-scrollbar p-10">
      <div class="max-w-5xl mx-auto">
        <header class="flex justify-between items-center mb-8">
          <div>
            <h1 class="text-2xl font-bold text-[var(--text-main)] mb-1">专题洞察</h1>
            <p class="text-xs text-[var(--text-muted)] font-medium uppercase tracking-widest">AI-Powered Topic Insights</p>
          </div>
          <el-button 
            v-if="!extractionData"
            type="primary" 
            @click="generateExtraction" 
            :loading="loading"
            class="!h-11 !px-8 !rounded-xl !text-sm !font-bold !bg-[var(--accent)] !border-none shadow-lg shadow-blue-500/20"
          >
            <Wand2 :size="18" class="mr-2" /> 开始合成专题洞察
          </el-button>
          <div v-else class="flex items-center gap-3 bg-[var(--bg-card)] px-5 py-2.5 rounded-xl border border-[var(--border)] shadow-sm">
            <BrainCircuit :size="16" class="text-purple-500" />
            <span class="text-sm font-bold text-[var(--text-main)]">{{ extractionData.title }}</span>
          </div>
        </header>

        <!-- Configuration Section (Only show when no data or creating new) -->
        <template v-if="!extractionData || loading">
          <ResearchPreferences 
            :initial-show="true" 
            :show-save-button="false"
            preference-type="topic"
            label="专题洞察偏好与配置"
          >
            <template #extra-settings>
              <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest ml-1">核心文献数量 (5 - 50)</label>
              <div class="flex items-center gap-6 bg-[var(--bg-card)] p-4 rounded-xl border border-[var(--border)]">
                <el-slider 
                  v-model="recommendationCount" 
                  :min="5" 
                  :max="50" 
                  :step="5"
                  class="flex-1"
                />
                <span class="text-lg font-mono font-bold text-[var(--accent)] w-8 text-right">{{ recommendationCount }}</span>
              </div>
            </template>
          </ResearchPreferences>

          <section class="mb-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="bg-[var(--bg-card)] p-6 rounded-2xl border border-[var(--border)] shadow-sm space-y-4">
              <div class="flex items-center gap-2 mb-1">
                <CalendarIcon :size="16" class="text-[var(--accent)]" />
                <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">分析时间范围</label>
              </div>
              <el-date-picker
                v-model="dateRange"
                type="daterange"
                range-separator="至"
                start-placeholder="开始日期"
                end-placeholder="结束日期"
                class="!w-full custom-date-picker-large"
                :clearable="false"
              />
            </div>

            <div class="bg-[var(--bg-card)] p-6 rounded-2xl border border-[var(--border)] shadow-sm space-y-4">
              <div class="flex items-center justify-between mb-1">
                <div class="flex items-center gap-2">
                  <Layers :size="16" class="text-[var(--accent)]" />
                  <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">文献筛选范围</label>
                </div>
              </div>
              <el-select
                v-model="selectedSources"
                multiple
                collapse-tags
                collapse-tags-tooltip
                placeholder="选择分组或订阅源"
                class="!w-full custom-select"
              >
                <el-option-group
                  v-for="group in sourceOptions"
                  :key="group.label"
                  :label="group.label"
                >
                  <el-option
                    v-for="item in group.options"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </el-option-group>
              </el-select>
            </div>
          </section>
        </template>

        <div class="space-y-8">
          <div v-if="loading" class="flex flex-col items-center justify-center h-64 opacity-50">
            <div class="w-10 h-10 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin"></div>
            <p class="text-xs font-bold mt-4 uppercase tracking-widest text-[var(--text-muted)]">正在生成专题洞察...</p>
          </div>

          <template v-else-if="extractionData">
            <!-- Synthesis Card -->
            <section class="bg-gradient-to-br from-purple-500/10 via-[var(--bg-card)] to-[var(--bg-card)] p-8 rounded-3xl border border-[var(--border)] relative overflow-hidden shadow-lg">
              <Sparkles class="absolute top-6 right-6 text-purple-500 opacity-20" :size="48" />
              
              <div class="flex items-center gap-3 mb-6">
                <div class="w-10 h-10 bg-purple-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-purple-500/20">
                  <BrainCircuit :size="20" />
                </div>
                <h2 class="text-lg font-bold text-[var(--text-main)]">专题洞察总结</h2>
              </div>
              
              <p class="text-[var(--text-main)] leading-relaxed text-base font-medium">
                {{ extractionData.summary }}
              </p>
            </section>

            <!-- Recommendations -->
            <section>
              <div class="flex items-center justify-between mb-6 px-2">
                <h2 class="text-lg font-bold text-[var(--text-main)] flex items-center gap-3">
                  <TrendingUp :size="20" class="text-[var(--success)]" /> 核心成果推荐
                </h2>
              </div>
              
              <div class="space-y-4">
                <div 
                  v-for="(item, index) in extractionData.recommendations" 
                  :key="item.id || index"
                  @click="store.jumpToArticle(item)"
                  class="bg-[var(--bg-card)] p-6 rounded-2xl border border-[var(--border)] hover:border-[var(--accent)]/50 transition-all flex justify-between items-center group cursor-pointer shadow-sm"
                >
                  <div class="flex-1 pr-8">
                    <div class="flex items-center gap-3 mb-2">
                      <span 
                        class="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest bg-purple-500/10 text-purple-500"
                      >
                        推荐
                      </span>
                      <span v-if="item.author" class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{{ item.author }}</span>
                      <span v-if="item.date" class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest flex items-center gap-1">
                        <Clock :size="10" /> {{ item.date }}
                      </span>
                    </div>
                    <h3 class="text-base font-bold text-[var(--text-main)] group-hover:text-[var(--accent)] transition-colors leading-snug mb-2">{{ item.title }}</h3>
                    <p v-if="item.abstract" class="text-xs text-[var(--text-muted)] line-clamp-2 leading-relaxed italic opacity-80">
                      {{ item.abstract }}
                    </p>
                  </div>
                  <div class="w-10 h-10 bg-[var(--bg-main)] rounded-xl flex items-center justify-center text-[var(--text-muted)] group-hover:bg-[var(--accent)] group-hover:text-white transition-all shadow-inner shrink-0">
                    <ArrowUpRight :size="20" />
                  </div>
                </div>
              </div>
            </section>
          </template>

          <div v-else class="flex flex-col items-center justify-center h-96 text-[var(--text-muted)] bg-[var(--bg-card)] rounded-3xl border border-[var(--border)] border-dashed">
            <Inbox :size="48" class="mb-4 opacity-10" />
            <h3 class="text-base font-bold uppercase tracking-widest">准备好开始了吗？</h3>
            <p class="text-xs mt-2">选择日期范围并点击“开始合成”来生成专题洞察</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-date-picker-large :deep(.el-range-input) {
  @apply !bg-transparent !text-sm !font-bold !text-[var(--text-main)];
}

.custom-date-picker-large :deep(.el-range-separator) {
  @apply !text-[var(--text-muted)];
}

:deep(.el-date-editor.el-input__wrapper) {
  background-color: rgba(var(--bg-main-rgb), 0.4) !important;
  @apply !border-[var(--border)] !rounded-xl !shadow-none !h-12 !px-4;
}

.custom-select :deep(.el-input__wrapper) {
  background-color: rgba(var(--bg-main-rgb), 0.4) !important;
  @apply !border-[var(--border)] !rounded-xl !shadow-none !h-12 !px-4;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  @apply bg-[var(--border)] rounded-full;
}
</style>
