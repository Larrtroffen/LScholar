<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import { useConfigStore } from '../store/config';
import { ElMessage } from 'element-plus';
import ModelManager from './ModelManager.vue';
import { 
  CheckCircle2, 
  Zap,
  BarChart3,
  Settings2,
  Languages,
  Layout,
  Download,
  Circle,
  Loader2
} from 'lucide-vue-next';

const configStore = useConfigStore();
const saving = ref(false);
const lastSaved = ref<number | null>(null);

// 翻译设置表单
const form = ref({
  translation_enabled: false,
  auto_translation_enabled: false,
  translation_mode: 'append'
});

// 计算当前选中的模型ID（使用 ref + watch 模式来正确同步）
const mainChatModelId = ref<number | null>(null);
const embeddingModelId = ref<number | null>(null);
const translationModelId = ref<number | null>(null);

// 监听 store 变化，同步到本地 ref
watch(
  () => configStore.assignments,
  (assignments) => {
    const mainChat = assignments.find(a => a.function_type === 'main_chat');
    const embedding = assignments.find(a => a.function_type === 'embedding');
    const translation = assignments.find(a => a.function_type === 'translation');
    mainChatModelId.value = mainChat?.model_id ?? null;
    embeddingModelId.value = embedding?.model_id ?? null;
    translationModelId.value = translation?.model_id ?? null;
  },
  { immediate: true, deep: true }
);

// 模型选项
const llmModels = computed(() => 
  configStore.models
    .filter(m => m.type === 'llm')
    .map(m => ({
      label: m.name,
      value: m.id!,
      description: m.model_name
    }))
);

const embeddingModels = computed(() => 
  configStore.models
    .filter(m => m.type === 'embedding')
    .map(m => ({
      label: m.name,
      value: m.id!,
      description: m.model_name
    }))
);

// 选择模型时的处理函数
const handleMainChatChange = async (value: number) => {
  console.log('[Settings] Main chat model changed to:', value);
  try {
    await configStore.setAssignment('main_chat', value);
    console.log('[Settings] Main chat assignment saved successfully');
    lastSaved.value = Date.now();
  } catch (error) {
    console.error('[Settings] Failed to save main chat assignment:', error);
    ElMessage.error('保存失败，请重试');
  }
};

const handleEmbeddingChange = async (value: number) => {
  console.log('[Settings] Embedding model changed to:', value);
  try {
    await configStore.setAssignment('embedding', value);
    console.log('[Settings] Embedding assignment saved successfully');
    lastSaved.value = Date.now();
  } catch (error) {
    console.error('[Settings] Failed to save embedding assignment:', error);
    ElMessage.error('保存失败，请重试');
  }
};

const handleTranslationChange = async (value: number) => {
  console.log('[Settings] Translation model changed to:', value);
  try {
    await configStore.setAssignment('translation', value);
    console.log('[Settings] Translation assignment saved successfully');
    lastSaved.value = Date.now();
  } catch (error) {
    console.error('[Settings] Failed to save translation assignment:', error);
    ElMessage.error('保存失败，请重试');
  }
};

// 检查本地模型是否已下载（已注册）
const isModelDownloaded = (modelName: string) => {
  return configStore.models.some(m => m.provider === 'local' && m.model_name === modelName);
};

const localModelOptions = [
  { 
    label: '专精中文', 
    value: 'Xenova/bge-small-zh-v1.5',
    description: '针对中文优化，适合中文文献',
    icon: '🇨🇳'
  },
  { 
    label: '专精英文', 
    value: 'Xenova/all-MiniLM-L6-v2',
    description: '针对英文优化，适合英文文献',
    icon: '🇬🇧'
  },
  { 
    label: '中英文支持', 
    value: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
    description: '支持多语言，适合混合文献',
    icon: '🌐'
  },
  { 
    label: '性能最强', 
    value: 'Xenova/bge-base-en-v1.5',
    description: '性能最优，适合高质量需求',
    icon: '⚡'
  }
];

const modelDownloadProgress = ref<{ model: string, percent: number } | null>(null);

// 选中模型并检查下载
const downloadLocalModel = async (modelName: string) => {
  if (isModelDownloaded(modelName)) {
    ElMessage.info('该模型已下载并注册');
    return;
  }

  modelDownloadProgress.value = { model: modelName, percent: 0 };
  try {
    // Simulate download
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Register model
    await configStore.addModel({
      name: modelName.split('/').pop() || modelName,
      provider: 'local',
      base_url: '',
      model_name: modelName,
      type: 'embedding',
      is_built_in: true
    });

    ElMessage.success('模型下载完成并已自动注册');
    
    // 刷新模型列表
    await configStore.fetchModels();
  } catch (error: any) {
    ElMessage.error(`模型下载失败: ${error.message}`);
  } finally {
    modelDownloadProgress.value = null;
  }
};

// 监听 store 中的设置变化，同步翻译设置到表单
watch(
  () => configStore.settings,
  (newSettings) => {
    if (newSettings) {
      let prefs: any = {};
      try {
        prefs = JSON.parse(newSettings.user_preferences || '{}');
      } catch {}

      form.value = {
        translation_enabled: prefs.translation_enabled || false,
        auto_translation_enabled: prefs.auto_translation_enabled || false,
        translation_mode: prefs.translation_mode || 'append'
      };
    }
  },
  { immediate: true, deep: true }
);

// 自动保存翻译设置
let saveTimeout: any = null;
watch(form, (newVal) => {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    saving.value = true;
    try {
      const prefs = {
        translation_enabled: newVal.translation_enabled,
        auto_translation_enabled: newVal.auto_translation_enabled,
        translation_mode: newVal.translation_mode
      };
      
      await configStore.updateSettings({
        user_preferences: JSON.stringify(prefs)
      });

      lastSaved.value = Date.now();
    } catch (error) {
      console.error('Auto-save failed:', error);
      ElMessage.error('保存失败，请重试');
    } finally {
      saving.value = false;
    }
  }, 1000);
}, { deep: true });

// 组件挂载时初始化
onMounted(async () => {
  console.log('[Settings] Component mounted');
  await configStore.fetchSettings();
  await configStore.fetchModels();
  await configStore.fetchAssignments();
});
</script>

<template>
  <div class="p-10 h-full overflow-y-auto custom-scrollbar bg-[var(--bg-main)]">
    <div class="max-w-4xl mx-auto">
      <header class="mb-10 flex items-end justify-between">
        <div>
          <div class="flex items-center gap-3 mb-2">
            <Settings2 :size="24" class="text-[var(--accent)]" />
            <h1 class="text-2xl font-bold text-[var(--text-main)]">系统设置</h1>
          </div>
          <p class="text-sm text-[var(--text-muted)] font-medium">配置 AI 模型引擎、网络代理及翻译偏好</p>
        </div>
        <div class="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">
          <template v-if="saving">
            <div class="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></div>
            正在保存...
          </template>
          <template v-else-if="lastSaved">
            <CheckCircle2 :size="12" class="text-green-500" />
            已自动保存
          </template>
        </div>
      </header>

      <div class="grid grid-cols-1 gap-8">
        <!-- AI Model Management -->
        <section class="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-8 shadow-sm">
          <ModelManager />
        </section>

        <!-- Function Assignment -->
        <section class="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-8 shadow-sm">
          <div class="flex items-center gap-3 mb-8">
            <div class="w-10 h-10 bg-green-500/10 rounded-xl flex items-center justify-center text-green-500">
              <Zap :size="20" />
            </div>
            <h2 class="text-lg font-bold text-[var(--text-main)]">功能模型分配</h2>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="space-y-2">
              <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest ml-1">通用对话/洞察</label>
              <el-select
                v-model="mainChatModelId"
                placeholder="选择模型"
                @change="handleMainChatChange"
                popper-class="custom-popper"
                clearable
                class="w-full"
              >
                <el-option
                  v-for="model in llmModels"
                  :key="model.value"
                  :label="model.label"
                  :value="model.value"
                >
                  <span>{{ model.label }}</span>
                  <span class="text-[10px] text-[var(--text-muted)] ml-2">{{ model.description }}</span>
                </el-option>
              </el-select>
            </div>
            <div class="space-y-2">
              <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest ml-1">文献翻译</label>
              <el-select
                v-model="translationModelId"
                placeholder="选择模型"
                @change="handleTranslationChange"
                popper-class="custom-popper"
                clearable
                class="w-full"
              >
                <el-option
                  v-for="model in llmModels"
                  :key="model.value"
                  :label="model.label"
                  :value="model.value"
                >
                  <span>{{ model.label }}</span>
                  <span class="text-[10px] text-[var(--text-muted)] ml-2">{{ model.description }}</span>
                </el-option>
              </el-select>
            </div>
            <div class="space-y-2">
              <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest ml-1">向量嵌入 (全局)</label>
              <el-select
                v-model="embeddingModelId"
                placeholder="选择模型"
                @change="handleEmbeddingChange"
                popper-class="custom-popper"
                clearable
                class="w-full"
              >
                <el-option
                  v-for="model in embeddingModels"
                  :key="model.value"
                  :label="model.label"
                  :value="model.value"
                >
                  <span>{{ model.label }}</span>
                  <span class="text-[10px] text-[var(--text-muted)] ml-2">{{ model.description }}</span>
                </el-option>
              </el-select>
              <p class="text-[10px] text-[var(--text-muted)]">
                注意：切换嵌入模型会导致现有的向量数据失效，建议切换后在嵌入管理页面重置向量库。
              </p>
            </div>
          </div>
        </section>

        <!-- Translation Configuration -->
        <section class="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-8 shadow-sm">
          <div class="flex items-center gap-3 mb-8">
            <div class="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500">
              <Languages :size="20" />
            </div>
            <h2 class="text-lg font-bold text-[var(--text-main)]">翻译设置</h2>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div class="space-y-4">
              <div class="flex items-center justify-between bg-[var(--bg-main)]/30 p-4 rounded-xl border border-[var(--border)]">
                <div>
                  <label class="text-sm font-bold text-[var(--text-main)]">启用 AI 翻译</label>
                  <p class="text-[10px] text-[var(--text-muted)] mt-1">在仪表盘显示翻译开关和一键翻译按钮</p>
                </div>
                <el-switch v-model="form.translation_enabled" />
              </div>

              <div class="flex items-center justify-between bg-[var(--bg-main)]/30 p-4 rounded-xl border border-[var(--border)]">
                <div>
                  <label class="text-sm font-bold text-[var(--text-main)]">自动翻译新文献</label>
                  <p class="text-[10px] text-[var(--text-muted)] mt-1">抓取到新文献后自动在后台进行翻译</p>
                </div>
                <el-switch v-model="form.auto_translation_enabled" :disabled="!form.translation_enabled" />
              </div>
            </div>

            <div class="space-y-3">
              <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest ml-1 flex items-center gap-2">
                <Layout :size="14" /> 翻译显示模式
              </label>
              <el-radio-group v-model="form.translation_mode" class="custom-radio-group">
                <el-radio-button value="append">追加到原文后</el-radio-button>
                <el-radio-button value="replace">直接替换原文</el-radio-button>
              </el-radio-group>
            </div>
          </div>

        </section>

        <!-- Local Model Management -->
        <section class="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-8 shadow-sm">
          <div class="flex items-center gap-3 mb-8">
            <div class="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center text-purple-500">
              <Download :size="20" />
            </div>
            <div>
              <h2 class="text-lg font-bold text-[var(--text-main)]">本地模型库</h2>
              <p class="text-xs text-[var(--text-muted)]">下载后即可在上方"功能模型分配"中选择使用</p>
            </div>
          </div>

          <div class="space-y-6">
            <!-- 模型选择网格 -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div
                v-for="model in localModelOptions"
                :key="model.value"
                class="relative p-5 rounded-xl border-2 transition-all duration-200 group flex flex-col"
                :class="[
                  isModelDownloaded(model.value)
                    ? 'border-green-500/30 bg-green-500/5'
                    : 'border-[var(--border)] hover:border-[var(--accent)]/50 bg-[var(--bg-card)]'
                ]"
              >
                <!-- 状态角标 -->
                <div class="absolute top-3 right-3">
                  <CheckCircle2 v-if="isModelDownloaded(model.value)" :size="16" class="text-green-500" />
                  <Circle v-else :size="16" class="text-[var(--border)]" />
                </div>

                <!-- 模型图标 -->
                <div class="text-3xl mb-3">{{ model.icon }}</div>
                
                <!-- 模型名称 -->
                <h4 class="text-sm font-bold text-[var(--text-main)] mb-1">{{ model.label }}</h4>
                
                <!-- 模型描述 -->
                <p class="text-xs text-[var(--text-muted)] mb-4 flex-1">{{ model.description }}</p>

                <!-- 操作按钮 -->
                <button
                  @click="downloadLocalModel(model.value)"
                  :disabled="isModelDownloaded(model.value) || !!modelDownloadProgress"
                  class="w-full py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2"
                  :class="[
                    isModelDownloaded(model.value)
                      ? 'bg-green-500/10 text-green-500 cursor-default'
                      : 'bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90'
                  ]"
                >
                  <template v-if="isModelDownloaded(model.value)">
                    已安装
                  </template>
                  <template v-else-if="modelDownloadProgress?.model === model.value">
                    <Loader2 class="animate-spin" :size="12" />
                    {{ modelDownloadProgress.percent }}%
                  </template>
                  <template v-else>
                    <Download :size="12" />
                    下载模型
                  </template>
                </button>
              </div>
            </div>

            <!-- 自动下载进度条 -->
            <div v-if="modelDownloadProgress" class="bg-[var(--bg-main)]/50 p-6 rounded-xl border border-[var(--accent)]/30 animate-in fade-in slide-in-from-top-2">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                  <Download :size="16" class="text-[var(--accent)] animate-bounce" />
                  <span class="text-sm font-bold text-[var(--text-main)]">正在下载 {{ modelDownloadProgress.model }}...</span>
                </div>
                <span class="text-sm font-black text-[var(--accent)]">{{ modelDownloadProgress.percent }}%</span>
              </div>
              <div class="w-full h-2.5 bg-[var(--bg-card)] rounded-full overflow-hidden border border-[var(--border)]">
                <div
                  class="h-full bg-gradient-to-r from-[var(--accent)] to-blue-500 transition-all duration-300 shadow-[0_0_10px_rgba(var(--accent-rgb),0.5)]"
                  :style="{ width: `${modelDownloadProgress.percent}%` }"
                ></div>
              </div>
              <p class="text-[10px] text-[var(--text-muted)] mt-3 italic">首次使用需要下载模型文件（约 100MB），请保持网络连接</p>
            </div>
          </div>
        </section>

        <!-- Token Stats -->
        <div class="grid grid-cols-1 gap-8">
          <section class="bg-gradient-to-br from-[var(--bg-card)] to-[var(--bg-main)] border border-[var(--border)] rounded-2xl p-8 shadow-sm">
            <div class="flex items-center gap-3 mb-8">
              <div class="w-10 h-10 bg-[var(--accent)]/10 rounded-xl flex items-center justify-center text-[var(--accent)]">
                <BarChart3 :size="20" />
              </div>
              <h2 class="text-lg font-bold text-[var(--text-main)]">Token 消耗统计</h2>
            </div>

            <div class="grid grid-cols-1 gap-6">
              <div class="relative">
                <p class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">今日已用</p>
                <div class="flex items-baseline gap-2">
                  <span class="text-2xl font-bold text-[var(--text-main)] tracking-tight">0</span>
                  <span class="text-[10px] text-[var(--text-muted)] font-bold uppercase">Tokens</span>
                </div>
              </div>
              <div class="relative">
                <p class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">本月累计</p>
                <div class="flex items-baseline gap-2">
                  <span class="text-2xl font-bold text-[var(--accent)] tracking-tight">0</span>
                  <span class="text-[10px] text-[var(--text-muted)] font-bold uppercase">Tokens</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div class="pb-20"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-radio-group :deep(.el-radio-button__inner) {
  background-color: var(--bg-main) !important;
  border-color: var(--border) !important;
  color: var(--text-muted) !important;
  font-size: 12px !important;
  padding: 10px 24px !important;
  transition: all 0.2s !important;
}

.custom-radio-group :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background-color: var(--accent) !important;
  border-color: var(--accent) !important;
  color: white !important;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05) !important;
}

.dark .custom-radio-group :deep(.el-radio-button__inner) {
  background-color: rgba(255, 255, 255, 0.05) !important;
}
</style>

