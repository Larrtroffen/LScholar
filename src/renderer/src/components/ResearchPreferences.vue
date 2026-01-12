<script setup lang="ts">
import { ref, computed, watch } from 'vue';
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
  preferenceType?: 'daily' | 'topic' | 'global'; // 偏好类型：每日洞察、专题洞察、全局
  label?: string;
}>();

const store = useConfigStore();
const savingPreferences = ref(false);
const showPreferences = ref(props.initialShow ?? true);
const localInterests = ref('');

// 解析 user_preferences 为 JSON 对象
const userPreferences = computed(() => {
  try {
    if (store.settings.user_preferences) {
      return JSON.parse(store.settings.user_preferences);
    }
  } catch {}
  return {};
});

// 获取对应类型的关键词
const getTypeInterests = (): string => {
  const type = props.preferenceType || 'global';
  let interests: string | string[] = '';
  
  if (type === 'global') {
    interests = userPreferences.value.interests || userPreferences.value.research_interests || userPreferences.value.topics || '';
  } else if (type === 'daily') {
    interests = userPreferences.value.daily_insight_preferences?.interests || userPreferences.value.interests || [];
  } else if (type === 'topic') {
    interests = userPreferences.value.topic_insight_preferences?.interests || userPreferences.value.interests || [];
  }
  
  // 确保返回字符串
  if (Array.isArray(interests)) {
    return interests.join(', ');
  }
  return String(interests || '');
};

// 初始化本地关键词
watch(() => store.settings.user_preferences, () => {
  localInterests.value = getTypeInterests();
}, { immediate: true });

const savePreferences = async () => {
  savingPreferences.value = true;
  try {
    const currentPrefs = userPreferences.value;
    const type = props.preferenceType || 'global';
    const interests = localInterests.value.split(',').map(s => s.trim()).filter(s => s);
    
    if (type === 'global') {
      currentPrefs.interests = interests;
    } else if (type === 'daily') {
      currentPrefs.daily_insight_preferences = {
        ...currentPrefs.daily_insight_preferences,
        interests
      };
    } else if (type === 'topic') {
      currentPrefs.topic_insight_preferences = {
        ...currentPrefs.topic_insight_preferences,
        interests
      };
    }
    
    await store.updateSettings({ user_preferences: JSON.stringify(currentPrefs) });
    ElMessage.success('研究偏好已保存');
  } catch (error: any) {
    ElMessage.error(`保存失败: ${error.message}`);
  } finally {
    savingPreferences.value = false;
  }
};

// 获取对应类型的推荐数量
const getTypeRecommendationCount = () => {
  const type = props.preferenceType || 'global';
  if (type === 'daily') {
    return userPreferences.value.daily_insight_preferences?.recommendation_count || 
           userPreferences.value.recommendation_count || 10;
  } else if (type === 'topic') {
    return userPreferences.value.topic_insight_preferences?.recommendation_count || 
           userPreferences.value.recommendation_count || 15;
  }
  return 10;
};

// 保存推荐数量
const saveRecommendationCount = async (count: number) => {
  try {
    const currentPrefs = userPreferences.value;
    const type = props.preferenceType || 'global';
    
    if (type === 'daily') {
      currentPrefs.daily_insight_preferences = {
        ...currentPrefs.daily_insight_preferences,
        recommendation_count: count
      };
    } else if (type === 'topic') {
      currentPrefs.topic_insight_preferences = {
        ...currentPrefs.topic_insight_preferences,
        recommendation_count: count
      };
    }
    
    await store.updateSettings({ user_preferences: JSON.stringify(currentPrefs) });
  } catch (error: any) {
    console.error('Failed to save recommendation count:', error);
  }
};

const defaultLabel = props.preferenceType === 'daily' ? '每日洞察' : 
                     props.preferenceType === 'topic' ? '专题洞察' : '研究';
</script>

<template>
  <section class="mb-8 bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm">
    <div 
      @click="showPreferences = !showPreferences"
      class="p-4 px-6 flex items-center justify-between cursor-pointer transition-colors hover-bg-main-alpha"
    >
      <div class="flex items-center gap-3">
        <UserCircle :size="18" class="text-[var(--accent)]" />
        <h2 class="text-sm font-bold text-[var(--text-main)] uppercase tracking-widest">{{ label || `${defaultLabel}偏好与配置` }}</h2>
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
              <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest ml-1">关键词 ({{ defaultLabel }} AI 将优先关注这些领域)</label>
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
              v-model="localInterests" 
              type="textarea" 
              :rows="3" 
              placeholder="例如：Deep Learning, NLP, Robotics..." 
              class="custom-textarea"
              @blur="savePreferences"
            />
          </div>
          
          <div class="space-y-4">
            <slot 
              name="extra-settings"
              :recommendation-count="getTypeRecommendationCount()"
              :save-recommendation-count="saveRecommendationCount"
            ></slot>
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
