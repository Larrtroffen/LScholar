<script setup lang="ts">
import { ref, onMounted, toRaw } from 'vue';
import { useMainStore } from '../store';
import { ElMessage } from 'element-plus';
import { 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  Save, 
  Cpu, 
  Globe, 
  ShieldCheck, 
  Zap,
  BarChart3,
  UserCircle,
  Settings2,
  Lock,
  Server,
  Info,
  Languages,
  Layout
} from 'lucide-vue-next';

const store = useMainStore();
const showApiKey = ref(false);
const testing = ref(false);
const saving = ref(false);

const form = ref({
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
});

onMounted(() => {
  form.value = { ...store.settings };
});

const testConnection = async () => {
  testing.value = true;
  try {
    const result = await (window as any).electron.ipcRenderer.invoke('test-connection', toRaw(form.value));
    if (result.success) {
      ElMessage.success('连接成功！');
    } else {
      ElMessage.error(`连接失败: ${result.error}`);
    }
  } catch (error: any) {
    ElMessage.error(`错误: ${error.message}`);
  } finally {
    testing.value = false;
  }
};

const saveSettings = async () => {
  saving.value = true;
  try {
    await (window as any).electron.ipcRenderer.invoke('save-settings', toRaw(form.value));
    await store.fetchSettings();
    ElMessage.success('设置已保存');
  } catch (error: any) {
    ElMessage.error(`保存失败: ${error.message}`);
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <div class="p-10 h-full overflow-y-auto custom-scrollbar bg-[var(--bg-main)]">
    <div class="max-w-4xl mx-auto">
      <header class="mb-10">
        <div class="flex items-center gap-3 mb-2">
          <Settings2 :size="24" class="text-[var(--accent)]" />
          <h1 class="text-2xl font-bold text-[var(--text-main)]">系统设置</h1>
        </div>
        <p class="text-sm text-[var(--text-muted)] font-medium">配置 AI 模型引擎、网络代理及翻译偏好</p>
      </header>

      <div class="grid grid-cols-1 gap-8">
        <!-- AI Configuration Card -->
        <section class="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-8 shadow-sm relative overflow-hidden">
          <div class="flex items-center gap-3 mb-8">
            <div class="w-10 h-10 bg-[var(--accent)]/10 rounded-xl flex items-center justify-center text-[var(--accent)]">
              <Cpu :size="20" />
            </div>
            <h2 class="text-lg font-bold text-[var(--text-main)]">AI 模型引擎</h2>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-2 md:col-span-2">
              <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest ml-1 flex items-center gap-2">
                <Globe :size="14" /> API Base URL
              </label>
              <el-input v-model="form.llm_base_url" placeholder="https://api.openai.com/v1" />
            </div>

            <div class="space-y-2 md:col-span-2">
              <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest ml-1 flex items-center gap-2">
                <Lock :size="14" /> API Key
              </label>
              <el-input 
                v-model="form.llm_api_key" 
                :type="showApiKey ? 'text' : 'password'" 
                placeholder="在此输入您的 API Key"
              >
                <template #suffix>
                  <button @click="showApiKey = !showApiKey" class="hover:text-[var(--accent)] transition-colors p-1">
                    <Eye v-if="!showApiKey" :size="16" />
                    <EyeOff v-else :size="16" />
                  </button>
                </template>
              </el-input>
            </div>

            <div class="space-y-2">
              <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest ml-1">LLM Model</label>
              <el-input v-model="form.llm_model_name" placeholder="gpt-4-turbo" />
            </div>
            
            <div class="space-y-2">
              <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest ml-1 flex items-center gap-2">
                Embedding Model <Info :size="12" class="cursor-help opacity-50" title="用于文献向量化，请确保接口支持 embeddings 终端" />
              </label>
              <el-input v-model="form.embedding_model_name" placeholder="text-embedding-3-small" />
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
            </div>

            <div class="space-y-3">
              <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest ml-1 flex items-center gap-2">
                <Layout :size="14" /> 翻译显示模式
              </label>
              <el-radio-group v-model="form.translation_mode" class="custom-radio-group">
                <el-radio-button label="append">追加到原文后</el-radio-button>
                <el-radio-button label="replace">直接替换原文</el-radio-button>
              </el-radio-group>
            </div>
          </div>

          <div class="mt-8 pt-8 border-t border-[var(--border)]">
            <h3 class="text-sm font-bold text-[var(--text-main)] mb-6 flex items-center gap-2">
              <Cpu :size="16" class="text-[var(--accent)]" /> 翻译专用模型配置 (留空则使用通用模型)
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div class="space-y-2 md:col-span-2">
                <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest ml-1">翻译 API Base URL</label>
                <el-input v-model="form.trans_llm_base_url" placeholder="https://api.openai.com/v1" />
              </div>
              <div class="space-y-2 md:col-span-2">
                <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest ml-1">翻译 API Key</label>
                <el-input v-model="form.trans_llm_api_key" type="password" placeholder="翻译专用 API Key" show-password />
              </div>
              <div class="space-y-2">
                <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest ml-1">翻译 LLM Model</label>
                <el-input v-model="form.trans_llm_model_name" placeholder="gpt-3.5-turbo (建议使用更快的模型)" />
              </div>
            </div>
          </div>
        </section>

        <!-- Proxy & Token Stats -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
          <section class="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-8 shadow-sm">
            <div class="flex items-center gap-3 mb-8">
              <div class="w-10 h-10 bg-orange-500/10 rounded-xl flex items-center justify-center text-orange-500">
                <Server :size="20" />
              </div>
              <h2 class="text-lg font-bold text-[var(--text-main)]">网络代理</h2>
            </div>
            <div class="space-y-2">
              <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest ml-1">HTTP Proxy URL</label>
              <el-input v-model="form.proxy_url" placeholder="http://127.0.0.1:7890" />
              <p class="text-[10px] text-[var(--text-muted)] mt-2 italic">留空则直连。支持 http/https 代理。</p>
            </div>
          </section>

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
                  <span class="text-2xl font-bold text-[var(--text-main)] tracking-tight">{{ store.tokenUsage.today.toLocaleString() }}</span>
                  <span class="text-[10px] text-[var(--text-muted)] font-bold uppercase">Tokens</span>
                </div>
              </div>
              <div class="relative">
                <p class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">本月累计</p>
                <div class="flex items-baseline gap-2">
                  <span class="text-2xl font-bold text-[var(--accent)] tracking-tight">{{ store.tokenUsage.month.toLocaleString() }}</span>
                  <span class="text-[10px] text-[var(--text-muted)] font-bold uppercase">Tokens</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <!-- Actions -->
        <div class="flex gap-4 pt-4 pb-10">
          <el-button 
            @click="testConnection" 
            :loading="testing"
            class="flex-1 !h-12 !rounded-xl !text-sm !font-bold"
          >
            <CheckCircle2 :size="18" class="mr-2" /> 测试连接
          </el-button>
          <el-button 
            type="primary" 
            @click="saveSettings" 
            :loading="saving"
            class="flex-1 !h-12 !rounded-xl !text-sm !font-bold shadow-lg shadow-accent/20"
          >
            <Save :size="18" class="mr-2" /> 保存所有配置
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.el-input :deep(.el-input__wrapper) {
  background-color: rgba(0, 0, 0, 0.05) !important;
}

.dark .el-input :deep(.el-input__wrapper) {
  background-color: rgba(0, 0, 0, 0.2) !important;
}

.custom-radio-group :deep(.el-radio-button__inner) {
  @apply !bg-[var(--bg-main)] !border-[var(--border)] !text-[var(--text-muted)] !text-xs !px-6 !py-2.5 !transition-all;
}

.custom-radio-group :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  @apply !bg-[var(--accent)] !border-[var(--accent)] !text-white !shadow-lg shadow-accent/20;
}

.dark .custom-radio-group :deep(.el-radio-button__inner) {
  background-color: rgba(255, 255, 255, 0.05) !important;
}
</style>
