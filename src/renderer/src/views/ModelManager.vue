<script setup lang="ts">
import { ref, onMounted, toRaw } from 'vue';
import { useConfigStore } from '../store/config';
import { ElMessage, ElMessageBox } from 'element-plus';
import CustomSelect from '../components/CustomSelect.vue';
import { 
  Plus, 
  Trash2, 
  Edit3, 
  Globe, 
  Cpu, 
  Zap, 
  ShieldCheck,
  Server,
  Activity
} from 'lucide-vue-next';

const configStore = useConfigStore();
const dialogVisible = ref(false);
const editingModel = ref<any>(null);
const testing = ref(false);

const form = ref({
  name: '',
  provider: 'custom',
  base_url: '',
  api_key: '',
  model_name: '',
  type: 'llm',
  proxy_url: '',
  is_active: 1
});

const types = [
  { label: 'LLM (对话/翻译)', value: 'llm', icon: '💬' },
  { label: 'Embedding (向量化)', value: 'embedding', icon: '🧠' }
];

onMounted(async () => {
  await configStore.fetchModels();
});

const openAddDialog = () => {
  editingModel.value = null;
  form.value = {
    name: '',
    provider: 'custom',
    base_url: '',
    api_key: '',
    model_name: '',
    type: 'llm',
    proxy_url: '',
    is_active: 1
  };
  dialogVisible.value = true;
};

const testConnection = async () => {
  testing.value = true;
  try {
    // 临时保存当前配置进行测试
    const result = await (window as any).electron.ipcRenderer.invoke('model:test', toRaw(form.value));
    if (result) {
      ElMessage.success('连接成功！');
    } else {
      ElMessage.error('连接失败');
    }
  } catch (error: any) {
    ElMessage.error(`错误: ${error.message}`);
  } finally {
    testing.value = false;
  }
};

const openEditDialog = (model: any) => {
  editingModel.value = model;
  form.value = { ...model };
  dialogVisible.value = true;
};

const saveModel = async () => {
  try {
    const modelData = {
      ...form.value,
      provider: form.value.provider as any,
      type: form.value.type as any,
      is_built_in: false
    };

    if (editingModel.value) {
      await configStore.updateModel(editingModel.value.id, modelData);
      ElMessage.success('模型已更新');
    } else {
      await configStore.addModel(modelData);
      ElMessage.success('模型已添加');
    }
    dialogVisible.value = false;
  } catch (error: any) {
    ElMessage.error(`保存失败: ${error.message}`);
  }
};

const deleteModel = async (id: number) => {
  try {
    await ElMessageBox.confirm('确定要删除这个模型配置吗？', '提示', { type: 'warning' });
    await configStore.deleteModel(id);
    ElMessage.success('模型已删除');
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(`删除失败: ${error.message}`);
    }
  }
};
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 bg-[var(--accent)]/10 rounded-xl flex items-center justify-center text-[var(--accent)]">
          <Cpu :size="20" />
        </div>
        <div>
          <h2 class="text-lg font-bold text-[var(--text-main)]">AI 模型库</h2>
          <p class="text-xs text-[var(--text-muted)]">管理所有的 AI 模型配置，支持独立代理设置</p>
        </div>
      </div>
      <el-button type="primary" @click="openAddDialog" class="!rounded-xl">
        <Plus :size="16" class="mr-1" /> 添加模型
      </el-button>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div 
        v-for="model in configStore.models" 
        :key="model.id"
        class="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 hover:border-[var(--accent)]/50 transition-all group"
      >
        <div class="flex items-start justify-between mb-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-[var(--bg-main)] flex items-center justify-center">
              <Zap v-if="model.type === 'llm'" :size="20" class="text-yellow-500" />
              <ShieldCheck v-else :size="20" class="text-purple-500" />
            </div>
            <div>
              <h3 class="font-bold text-[var(--text-main)]">{{ model.name }}</h3>
              <div class="flex items-center gap-2 mt-1">
                <el-tag size="small" effect="plain">{{ model.provider }}</el-tag>
                <el-tag size="small" type="info" effect="plain">{{ model.model_name }}</el-tag>
              </div>
            </div>
          </div>
          <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <el-button circle size="small" @click="openEditDialog(model)">
              <Edit3 :size="14" />
            </el-button>
            <el-button circle size="small" type="danger" @click="deleteModel(model.id!)">
              <Trash2 :size="14" />
            </el-button>
          </div>
        </div>

        <div class="space-y-2 text-xs text-[var(--text-muted)]">
          <div class="flex items-center gap-2">
            <Globe :size="12" />
            <span class="truncate">{{ model.base_url }}</span>
          </div>
          <div v-if="model.proxy_url" class="flex items-center gap-2 text-orange-500">
            <Server :size="12" />
            <span>代理: {{ model.proxy_url }}</span>
          </div>
        </div>
      </div>
    </div>

    <el-dialog
      v-model="dialogVisible"
      :title="editingModel ? '编辑模型配置' : '添加新模型'"
      width="550px"
      class="custom-dialog"
      :align-center="true"
    >
      <div class="px-2 pb-6">
        <el-form :model="form" label-position="top" class="space-y-5">
          <div class="grid grid-cols-2 gap-4">
            <el-form-item label="配置名称">
              <el-input v-model="form.name" placeholder="例如: 我的 GPT-4" />
            </el-form-item>
            <el-form-item label="模型类型">
              <CustomSelect v-model="form.type" :options="types" />
            </el-form-item>
          </div>

          <el-form-item label="API Base URL">
            <el-input v-model="form.base_url" placeholder="https://api.openai.com/v1" />
          </el-form-item>

          <el-form-item label="API Key">
            <el-input v-model="form.api_key" type="password" show-password placeholder="在此输入 API Key" />
          </el-form-item>

          <div class="grid grid-cols-2 gap-4">
            <el-form-item label="模型名称">
              <el-input v-model="form.model_name" placeholder="gpt-4-turbo" />
            </el-form-item>
            <el-form-item label="独立代理 URL (可选)">
              <el-input v-model="form.proxy_url" placeholder="http://127.0.0.1:7890" />
            </el-form-item>
          </div>
        </el-form>
      </div>
      
      <template #footer>
        <div class="flex items-center gap-3 pt-4 border-t border-[var(--border)] px-2 pb-4">
          <el-button 
            @click="testConnection" 
            :loading="testing"
            class="!rounded-xl !h-11 px-6"
          >
            <Activity :size="16" class="mr-2" /> 测试连接
          </el-button>
          <div class="flex-1"></div>
          <el-button @click="dialogVisible = false" class="!rounded-xl !h-11 px-8">取消</el-button>
          <el-button type="primary" @click="saveModel" class="!rounded-xl !h-11 px-8 shadow-lg shadow-accent/20">
            保存配置
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.custom-dialog :deep(.el-dialog) {
  border-radius: 20px;
  background-color: var(--bg-card);
}
</style>
