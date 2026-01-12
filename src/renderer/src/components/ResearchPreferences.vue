<script setup lang="ts">
import { ref } from 'vue';
import { 
  UserCircle, 
  Save, 
  ChevronDown, 
  ChevronUp 
} from 'lucide-vue-next';
import { ElMessage } from 'element-plus';
import { useConfigStore } from '../store/config';

const props = defineProps<{
  initialShow?: boolean;
  showSaveButton?: boolean;
}>();

const store = useConfigStore();
const savingPreferences = ref(false);
const showPreferences = ref(props.initialShow ?? true);

const savePreferences = async () => {
  savingPreferences.value = true;
  try {
    await store.updateSettings({ user_preferences: store.settings.user_preferences });
    ElMessage.success('研究偏好已保存');
  } catch (error: any) {
    ElMessage.error(`保存失败: ${error.message}`);
  } finally {
    savingPreferences.value = false;
  }
};
</script>

<template>
  <section class="mb-8 bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm">
    <div 
      @click="showPreferences = !showPreferences"
      class="p-4 px-6 flex items-center justify-between cursor-pointer transition-colors hover-bg-main-alpha"
    >
      <div class="flex items-center gap-3">
        <UserCircle :size="18" class="text-[var(--accent)]" />
        <h2 class="text-sm font-bold text-[var(--text-main)] uppercase tracking-widest">研究偏好与配置</h2>
      </div>
      <component :is="showPreferences ? ChevronUp : ChevronDown" :size="18" class="text-[var(--text-muted)]" />
    </div>
    
    <el-collapse-transition>
      <div 
        v-show="showPreferences" 
        class="p-6 pt-2 border-t border-[var(--border)]"
        :style="{ backgroundColor: 'rgba(var(--bg-main-rgb), 0.2)' }"
      >
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div class="space-y-3">
            <div class="flex justify-between items-center">
              <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest ml-1">关键词 (AI 将优先关注这些领域)</label>
              <el-button 
                v-if="props.showSaveButton !== false"
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
            <slot name="extra-settings"></slot>
          </div>
        </div>
      </div>
    </el-collapse-transition>
  </section>
</template>

<style scoped>
.hover-bg-main-alpha:hover {
  background-color: rgba(var(--bg-main-rgb), 0.5);
}

.custom-textarea :deep(.el-textarea__inner) {
  @apply !bg-[var(--bg-main)] !border-[var(--border)] !rounded-xl !text-sm !text-[var(--text-main)] !p-4;
}
</style>
