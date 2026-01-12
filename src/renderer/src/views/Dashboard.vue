<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useDataStore } from '../store/data';
import { useConfigStore } from '../store/config';
import { useTaskStore } from '../store/task';
import { storeToRefs } from 'pinia';
import { 
  Search, 
  Star, 
  ExternalLink, 
  ChevronRight,
  Filter,
  BookOpen,
  Calendar as CalendarIcon,
  User,
  ChevronLeft,
  GripVertical,
  Languages,
  Eye,
  EyeOff,
  CheckCircle,
  Circle,
  X
} from 'lucide-vue-next';
import { ElMessage } from 'element-plus';

const dataStore = useDataStore();
const configStore = useConfigStore();
const taskStore = useTaskStore();

const { articles, feeds, groups, selectedArticle, isLoading, translatingIds } = storeToRefs(dataStore);
const { settings } = storeToRefs(configStore);
const { embeddingStats } = storeToRefs(taskStore);

const searchQuery = ref('');
const selectedFeedId = ref<number | null>(null);
const selectedGroupId = ref<number | null>(null);
const isDetailsVisible = ref(true);
const detailsWidth = ref(400);

// 筛选器状态
const showFilterPanel = ref(false);
const filterReadStatus = ref<'all' | 'read' | 'unread'>('all');
const filterEmbeddingStatus = ref<'all' | 'completed' | 'pending' | 'none'>('all');

// 翻译设置
const translationEnabled = computed(() => {
  try {
    if (settings.value.user_preferences) {
      const prefs = JSON.parse(settings.value.user_preferences);
      return prefs.translation_enabled === true;
    }
  } catch {}
  return false;
});

// 自动翻译设置
const autoTranslationEnabled = computed(() => {
  try {
    if (settings.value.user_preferences) {
      const prefs = JSON.parse(settings.value.user_preferences);
      return prefs.auto_translation_enabled === true;
    }
  } catch {}
  return false;
});

// 翻译显示模式: 'append' 追加到原文后, 'replace' 替换原文
const translationMode = computed(() => {
  try {
    if (settings.value.user_preferences) {
      const prefs = JSON.parse(settings.value.user_preferences);
      return prefs.translation_mode || 'append';
    }
  } catch {}
  return 'append';
});

const fetchArticles = async () => {
  await dataStore.fetchArticles();
};

onMounted(async () => {
  await dataStore.fetchFeeds();
  await dataStore.fetchGroups();
  await fetchArticles();
  await taskStore.fetchStats();
});

const filteredArticles = computed(() => {
  let result = articles.value;
  
  // 按订阅源筛选
  if (selectedFeedId.value) {
    result = result.filter(a => a.feed_id === selectedFeedId.value);
  }
  
  // 按分组筛选
  if (selectedGroupId.value) {
    const feedsInGroup = feeds.value.filter(f => f.group_id === selectedGroupId.value).map(f => f.id);
    result = result.filter(a => feedsInGroup.includes(a.feed_id));
  }
  
  // 按已读状态筛选
  if (filterReadStatus.value === 'read') {
    result = result.filter(a => a.is_read);
  } else if (filterReadStatus.value === 'unread') {
    result = result.filter(a => !a.is_read);
  }
  
  // 按嵌入状态筛选
  if (filterEmbeddingStatus.value !== 'all') {
    result = result.filter(a => a.embedding_status === filterEmbeddingStatus.value);
  }
  
  // 搜索筛选
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    result = result.filter(a => 
      a.title?.toLowerCase().includes(q) || 
      a.summary?.toLowerCase().includes(q) ||
      a.author?.toLowerCase().includes(q)
    );
  }
  
  return result;
});

// 检查是否有活动筛选器
const hasActiveFilters = computed(() => {
  return filterReadStatus.value !== 'all' || filterEmbeddingStatus.value !== 'all';
});

// 清除所有筛选器
const clearFilters = () => {
  filterReadStatus.value = 'all';
  filterEmbeddingStatus.value = 'all';
};

const selectArticle = async (article: any) => {
  dataStore.selectArticle(article);
  isDetailsVisible.value = true;
  
  // 自动翻译：检查设置并触发后台翻译
  if (autoTranslationEnabled.value && article.id) {
    const articleData = dataStore.articles.find(a => a.id === article.id);
    if (articleData && !articleData.trans_title && !articleData.trans_abstract) {
      // 检查是否已经在翻译中
      if (!translatingIds.value.includes(article.id)) {
        // 后台静默翻译，不显示成功消息
        dataStore.translateArticle(article.id).catch((err: any) => {
          console.warn('Auto-translation failed:', err);
        });
      }
    }
  }
};

const toggleFavorite = async (article: any) => {
  await dataStore.toggleFavorite(article.id);
};

// 翻译文章
const translateArticle = async () => {
  if (!selectedArticle.value?.id) return;
  
  try {
    await dataStore.translateArticle(selectedArticle.value.id);
    ElMessage.success('翻译完成');
  } catch (error: any) {
    ElMessage.error(`翻译失败: ${error.message}`);
  }
};

// 检查文章是否正在翻译
const isTranslating = computed(() => {
  return selectedArticle.value?.id ? translatingIds.value.includes(selectedArticle.value.id) : false;
});

// 检查文章是否已翻译
const hasTranslation = computed(() => {
  return selectedArticle.value?.trans_title || selectedArticle.value?.trans_abstract;
});

const formatAuthors = (authors: string | undefined) => {
  return authors || 'Unknown Author';
};

const openExternal = (url: string) => {
  if (!url) {
    ElMessage.warning('文章链接为空，无法打开原文');
    return;
  }
  
  // 验证 URL 格式
  try {
    new URL(url);
  } catch {
    ElMessage.error('文章链接格式无效');
    return;
  }
  
  // 检查 Electron API 是否可用
  const electron = (window as any).electron;
  if (!electron || !electron.shell) {
    // 如果 Electron API 不可用，使用原生浏览器打开
    console.warn('Electron API not available, using native window.open');
    window.open(url, '_blank');
    return;
  }
  
  // 使用 Electron 的 shell API 在默认浏览器中打开
  try {
    electron.shell.openExternal(url);
  } catch (err: any) {
    console.error('Failed to open external URL:', err);
    // 降级到原生方法
    window.open(url, '_blank');
  }
};

// 详情栏拖拽逻辑
const startResizing = (e: MouseEvent) => {
  const startX = e.clientX;
  const startWidth = detailsWidth.value;
  
  const onMouseMove = (moveEvent: MouseEvent) => {
    const delta = startX - moveEvent.clientX;
    detailsWidth.value = Math.max(300, Math.min(800, startWidth + delta));
  };
  
  const onMouseUp = () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };
  
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
};

const getEmbeddingPercent = (feedId: number) => {
  const stat = embeddingStats.value.find(s => s.feedId === feedId);
  return stat ? stat.percent : 0;
};

// 获取分组下的订阅源
const getFeedsInGroup = (groupId: number) => {
  return feeds.value.filter(f => f.group_id === groupId);
};

// 获取未分组的订阅源
const ungroupedFeeds = computed(() => {
  return feeds.value.filter(f => !f.group_id);
});
</script>

<template>
  <div class="flex h-full w-full overflow-hidden bg-[var(--bg-main)]">
    <!-- Left Column: Navigation -->
    <div class="w-64 bg-[var(--bg-main)] border-r border-[var(--border)] flex flex-col shrink-0">
      <div class="p-6 flex-1 overflow-y-auto custom-scrollbar">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">文献库</h2>
          <button 
            @click="showFilterPanel = !showFilterPanel"
            class="p-1.5 hover:bg-[var(--bg-card)] rounded-lg transition-all"
            :class="hasActiveFilters ? 'text-[var(--accent)] bg-[var(--accent)]/10' : 'text-[var(--text-muted)]'"
            title="筛选"
          >
            <Filter :size="14" />
          </button>
        </div>

        <!-- 筛选面板 -->
        <div v-if="showFilterPanel" class="mb-6 p-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border)] space-y-4">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-[var(--text-main)]">筛选条件</span>
            <button 
              v-if="hasActiveFilters"
              @click="clearFilters"
              class="text-[10px] text-[var(--accent)] hover:underline"
            >
              清除
            </button>
          </div>
          
          <!-- 已读状态 -->
          <div>
            <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2 block">阅读状态</label>
            <div class="flex gap-2">
              <button 
                @click="filterReadStatus = 'all'"
                class="px-2 py-1 text-[10px] rounded-lg transition-all"
                :class="filterReadStatus === 'all' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-main)] text-[var(--text-muted)]'"
              >全部</button>
              <button 
                @click="filterReadStatus = 'unread'"
                class="px-2 py-1 text-[10px] rounded-lg transition-all flex items-center gap-1"
                :class="filterReadStatus === 'unread' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-main)] text-[var(--text-muted)]'"
              ><Circle :size="10" /> 未读</button>
              <button 
                @click="filterReadStatus = 'read'"
                class="px-2 py-1 text-[10px] rounded-lg transition-all flex items-center gap-1"
                :class="filterReadStatus === 'read' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-main)] text-[var(--text-muted)]'"
              ><CheckCircle :size="10" /> 已读</button>
            </div>
          </div>
          
          <!-- 嵌入状态 -->
          <div>
            <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2 block">嵌入状态</label>
            <div class="flex flex-wrap gap-2">
              <button 
                @click="filterEmbeddingStatus = 'all'"
                class="px-2 py-1 text-[10px] rounded-lg transition-all"
                :class="filterEmbeddingStatus === 'all' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-main)] text-[var(--text-muted)]'"
              >全部</button>
              <button 
                @click="filterEmbeddingStatus = 'completed'"
                class="px-2 py-1 text-[10px] rounded-lg transition-all"
                :class="filterEmbeddingStatus === 'completed' ? 'bg-green-500 text-white' : 'bg-[var(--bg-main)] text-[var(--text-muted)]'"
              >已嵌入</button>
              <button 
                @click="filterEmbeddingStatus = 'pending'"
                class="px-2 py-1 text-[10px] rounded-lg transition-all"
                :class="filterEmbeddingStatus === 'pending' ? 'bg-yellow-500 text-white' : 'bg-[var(--bg-main)] text-[var(--text-muted)]'"
              >处理中</button>
              <button 
                @click="filterEmbeddingStatus = 'none'"
                class="px-2 py-1 text-[10px] rounded-lg transition-all"
                :class="filterEmbeddingStatus === 'none' ? 'bg-gray-500 text-white' : 'bg-[var(--bg-main)] text-[var(--text-muted)]'"
              >未嵌入</button>
            </div>
          </div>
        </div>
        
        <nav class="space-y-1">
          <button 
            @click="selectedFeedId = null; selectedGroupId = null"
            class="w-full flex items-center px-3 py-2 rounded-xl text-sm transition-all duration-200 group"
            :class="!selectedFeedId && !selectedGroupId ? 'bg-[var(--accent)]/10 text-[var(--accent)] font-semibold' : 'text-[var(--text-muted)] hover:bg-[var(--bg-card)] hover:text-[var(--text-main)]'"
          >
            <BookOpen :size="16" class="mr-3" />
            全部文献
            <span class="ml-auto text-[10px] opacity-60">{{ articles.length }}</span>
          </button>
        </nav>

        <!-- 分组列表 -->
        <div v-if="groups.length > 0" class="mt-8">
          <h2 class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-4">分组</h2>
          <nav class="space-y-1">
            <div v-for="group in groups" :key="group.id">
              <button 
                @click="selectedGroupId = group.id || null; selectedFeedId = null"
                class="w-full flex items-center px-3 py-2 rounded-xl text-sm transition-all duration-200 group"
                :class="selectedGroupId === group.id ? 'bg-[var(--accent)]/10 text-[var(--accent)] font-semibold' : 'text-[var(--text-muted)] hover:bg-[var(--bg-card)] hover:text-[var(--text-main)]'"
              >
                <div class="w-1.5 h-1.5 rounded-full bg-[var(--border)] mr-3 group-hover:bg-[var(--accent)] transition-colors shrink-0" :class="selectedGroupId === group.id ? 'bg-[var(--accent)]' : ''"></div>
                <span class="truncate">{{ group.name }}</span>
                <span class="ml-auto text-[10px] opacity-60">{{ getFeedsInGroup(group.id!).length }}</span>
              </button>
            </div>
          </nav>
        </div>

        <div class="mt-8">
          <h2 class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-4">订阅源</h2>
        </div>
        
        <div class="space-y-1">
          <!-- Feeds List -->
          <div v-for="feed in ungroupedFeeds" :key="feed.id">
            <button 
              @click="selectedFeedId = feed.id || null; selectedGroupId = null"
              class="w-full flex items-center px-3 py-2 rounded-xl text-sm transition-all duration-200 truncate group mb-1"
              :class="selectedFeedId === feed.id ? 'bg-[var(--accent)]/10 text-[var(--accent)] font-semibold' : 'text-[var(--text-muted)] hover:bg-[var(--bg-card)] hover:text-[var(--text-main)]'"
              :title="feed.name"
            >
              <div class="w-1.5 h-1.5 rounded-full bg-[var(--border)] mr-3 group-hover:bg-[var(--accent)] transition-colors shrink-0" :class="selectedFeedId === feed.id ? 'bg-[var(--accent)]' : ''"></div>
              <span class="truncate">{{ feed.name }}</span>
            </button>
            <!-- 嵌入进度条 -->
            <div v-if="getEmbeddingPercent(feed.id!) > 0" class="ml-4 mb-2">
              <div class="flex items-center gap-2 mb-1">
                <div class="flex-1 h-1 bg-[var(--bg-main)] rounded-full overflow-hidden">
                  <div 
                    class="h-full transition-all duration-300"
                    :class="[
                      getEmbeddingPercent(feed.id!) === 100 ? 'bg-green-500' :
                      getEmbeddingPercent(feed.id!) >= 50 ? 'bg-blue-500' :
                      'bg-yellow-500'
                    ]"
                    :style="{ width: `${getEmbeddingPercent(feed.id!)}%` }"
                  ></div>
                </div>
                <span class="text-[9px] font-bold text-[var(--text-muted)]">
                  {{ getEmbeddingPercent(feed.id!) }}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Middle Column: Article List -->
    <div class="flex-1 flex flex-col bg-[var(--bg-main)] min-w-[400px]">
      <header class="h-16 flex items-center px-6 border-b border-[var(--border)] shrink-0">
        <div class="relative flex-1 max-w-xl">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" :size="16" />
          <input 
            v-model="searchQuery"
            type="text" 
            placeholder="搜索标题、作者、摘要..." 
            class="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded-xl py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-[var(--accent)]/50 outline-none transition-all"
          />
        </div>
        <!-- 显示筛选结果数量 -->
        <div class="ml-4 text-xs text-[var(--text-muted)]">
          {{ filteredArticles.length }} 篇文献
        </div>
      </header>

      <div class="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
        <div v-if="isLoading" class="flex flex-col items-center justify-center h-64 space-y-4 opacity-50">
          <div class="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin"></div>
          <p class="text-xs font-medium">正在加载...</p>
        </div>
        
        <div v-else-if="filteredArticles.length === 0" class="flex flex-col items-center justify-center h-64 text-[var(--text-muted)]">
          <BookOpen :size="32" class="mb-3 opacity-20" />
          <p class="text-xs font-medium">未找到相关文献</p>
          <button 
            v-if="hasActiveFilters"
            @click="clearFilters"
            class="mt-2 text-xs text-[var(--accent)] hover:underline"
          >
            清除筛选条件
          </button>
        </div>

        <div 
          v-for="article in filteredArticles" 
          :key="article.id"
          :data-article-id="article.id"
          @click="selectArticle(article)"
          class="bg-[var(--bg-card)] p-5 rounded-2xl border border-[var(--border)] hover:border-[var(--accent)]/50 cursor-pointer transition-all group relative"
          :class="[
            selectedArticle?.id === article.id ? 'ring-2 ring-[var(--accent)] border-transparent' : '',
            !article.is_read ? 'border-l-4 border-l-[var(--accent)]' : ''
          ]"
        >
          <div class="flex justify-between items-start mb-2">
          <h3 class="font-bold text-base text-[var(--text-main)] leading-snug pr-10 group-hover:text-[var(--accent)] transition-colors line-clamp-2">
              <template v-if="translationMode === 'replace' && article.trans_title">
                {{ article.trans_title }}
              </template>
              <template v-else>
                {{ article.title }}
              </template>
            </h3>
            <div class="absolute top-5 right-5 flex items-center gap-2">
              <button 
                @click.stop="toggleFavorite(article)"
                class="p-1.5 rounded-lg hover:bg-[var(--bg-main)] transition-all"
                :class="article.is_favorite ? 'text-[var(--warning)]' : 'text-[var(--text-muted)] hover:text-[var(--warning)]'"
              >
                <Star :size="18" :fill="article.is_favorite ? 'currentColor' : 'none'" />
              </button>
            </div>
          </div>
          
          <p class="text-xs text-[var(--text-muted)] mb-2 line-clamp-1 font-medium">{{ formatAuthors(article.author) }}</p>
          
          <!-- 摘要预览 -->
          <p class="text-[11px] text-[var(--text-muted)] mb-4 line-clamp-2 leading-relaxed italic opacity-80">
            <template v-if="translationMode === 'replace' && article.trans_abstract">
              {{ article.trans_abstract }}
            </template>
            <template v-else>
              {{ article.summary }}
            </template>
          </p>

          <div class="flex items-center gap-4 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
            <span class="flex items-center gap-1.5"><CalendarIcon :size="12" /> {{ article.publish_date }}</span>
            <!-- 嵌入状态标签 -->
            <span 
              v-if="article.embedding_status === 'completed'"
              class="px-1.5 py-0.5 bg-green-500/10 text-green-500 rounded text-[9px]"
            >已嵌入</span>
            <span 
              v-else-if="article.embedding_status === 'pending'"
              class="px-1.5 py-0.5 bg-yellow-500/10 text-yellow-500 rounded text-[9px]"
            >处理中</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Right Column: Details (Resizable) -->
    <div 
      v-if="isDetailsVisible && selectedArticle"
      class="relative bg-[var(--bg-card)] border-l border-[var(--border)] flex flex-col shrink-0 shadow-2xl"
      :style="{ width: detailsWidth + 'px' }"
    >
      <!-- Resize Handle -->
      <div 
        @mousedown="startResizing"
        class="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[var(--accent)] transition-colors z-20 flex items-center justify-center group"
      >
        <div class="opacity-0 group-hover:opacity-100 bg-[var(--accent)] p-0.5 rounded-full">
          <GripVertical :size="12" class="text-white" />
        </div>
      </div>

      <header class="h-16 flex items-center justify-between px-8 border-b border-[var(--border)] shrink-0">
        <div class="flex items-center gap-4">
          <h2 class="font-bold text-sm text-[var(--text-main)]">文献详情</h2>
        </div>
        <div class="flex items-center gap-2">
          <!-- 翻译按钮 -->
          <button 
            v-if="translationEnabled"
            @click="translateArticle"
            :disabled="isTranslating"
            class="p-1.5 hover:bg-[var(--bg-main)] rounded-lg transition-all"
            :class="hasTranslation ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'"
            :title="hasTranslation ? '已翻译' : '翻译'"
          >
            <Languages :size="18" :class="isTranslating ? 'animate-pulse' : ''" />
          </button>
          <button @click="isDetailsVisible = false" class="p-1.5 hover:bg-[var(--bg-main)] rounded-lg text-[var(--text-muted)]">
            <ChevronRight :size="18" />
          </button>
        </div>
      </header>

        <div class="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
        <div>
          <div class="flex items-center gap-3 mb-4">
            <span v-if="selectedArticle.publish_date" class="bg-[var(--success)]/10 text-[var(--success)] text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-widest">Published</span>
            <span v-if="!selectedArticle.is_read" class="bg-[var(--accent)]/10 text-[var(--accent)] text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-widest">未读</span>
          </div>
          <!-- 标题显示逻辑：根据翻译模式决定显示原文还是翻译 -->
          <h2 class="text-xl font-bold text-[var(--text-main)] leading-tight mb-2">
            <template v-if="translationMode === 'replace' && selectedArticle.trans_title">
              {{ selectedArticle.trans_title }}
            </template>
            <template v-else>
              {{ selectedArticle.title }}
              <template v-if="selectedArticle.trans_title">
                <span class="text-[var(--accent)] italic font-normal block text-base mt-1">{{ selectedArticle.trans_title }}</span>
              </template>
            </template>
          </h2>
        </div>
        
        <div class="space-y-8">
          <section>
            <div class="flex justify-between items-center mb-3">
              <h4 class="text-[10px] font-bold text-[var(--accent)] uppercase tracking-widest flex items-center gap-2">
                <User :size="14" /> 作者
              </h4>
            </div>
            <p class="text-sm text-[var(--text-main)] leading-relaxed font-semibold">{{ formatAuthors(selectedArticle.author) }}</p>
          </section>

          <section>
            <h4 class="text-[10px] font-bold text-[var(--accent)] uppercase tracking-widest mb-3 flex items-center gap-2">
              <BookOpen :size="14" /> 摘要
            </h4>
            <!-- 摘要显示逻辑：根据翻译模式决定 -->
            <template v-if="translationMode === 'replace'">
              <!-- 替换模式：只显示翻译摘要 -->
              <div v-if="selectedArticle.trans_abstract" class="bg-[var(--accent)]/5 p-5 rounded-2xl border border-[var(--accent)]/20">
                <p class="text-sm text-[var(--text-main)] leading-relaxed text-justify">
                  {{ selectedArticle.trans_abstract }}
                </p>
              </div>
              <div v-else class="bg-[var(--bg-main)] p-5 rounded-2xl border border-[var(--border)]">
                <p class="text-sm text-[var(--text-muted)] leading-relaxed text-justify italic">
                  {{ selectedArticle.summary }}
                </p>
              </div>
            </template>
            <template v-else>
              <!-- 追加模式：原文在前，翻译在后 -->
              <div class="bg-[var(--bg-main)] p-5 rounded-2xl border border-[var(--border)]">
                <p class="text-sm text-[var(--text-muted)] leading-relaxed text-justify italic">
                  {{ selectedArticle.summary }}
                </p>
              </div>
              <div v-if="selectedArticle.trans_abstract" class="mt-4 bg-[var(--accent)]/5 p-5 rounded-2xl border border-[var(--accent)]/20">
                <h5 class="text-[10px] font-bold text-[var(--accent)] uppercase tracking-widest mb-2 flex items-center gap-2">
                  <Languages :size="12" /> 中文翻译
                </h5>
                <p class="text-sm text-[var(--text-main)] leading-relaxed text-justify">
                  {{ selectedArticle.trans_abstract }}
                </p>
              </div>
            </template>
          </section>

          <div class="grid grid-cols-1 gap-4">
            <div class="bg-[var(--bg-main)] p-4 rounded-xl border border-[var(--border)]">
              <h4 class="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1">发表日期</h4>
              <p class="text-sm font-bold text-[var(--text-main)]">{{ selectedArticle.publish_date }}</p>
            </div>
          </div>

          <div class="pt-6 sticky bottom-0 bg-gradient-to-t from-[var(--bg-card)] via-[var(--bg-card)] to-transparent pb-4 space-y-3">
            <!-- 翻译按钮（如果启用翻译但还没翻译） -->
            <button 
              v-if="translationEnabled && !hasTranslation"
              @click="translateArticle"
              :disabled="isTranslating"
              class="flex items-center justify-center gap-3 w-full bg-[var(--bg-main)] hover:bg-[var(--accent)]/10 text-[var(--text-main)] py-3 rounded-xl font-bold transition-all border border-[var(--border)]"
            >
              <Languages :size="16" :class="isTranslating ? 'animate-spin' : ''" />
              {{ isTranslating ? '翻译中...' : '翻译此文献' }}
            </button>
            <button 
              @click="openExternal(selectedArticle.url)"
              class="flex items-center justify-center gap-3 w-full bg-[var(--accent)] hover:opacity-90 text-white py-3.5 rounded-xl font-bold transition-all shadow-lg shadow-[var(--accent)]/20 group"
            >
              访问原文 <ExternalLink :size="16" class="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Details Toggle Button (when hidden) -->
    <button 
      v-if="!isDetailsVisible && selectedArticle"
      @click="isDetailsVisible = true"
      class="absolute right-0 top-1/2 -translate-y-1/2 bg-[var(--accent)] text-white p-1.5 rounded-l-xl shadow-xl z-30"
    >
      <ChevronLeft :size="20" />
    </button>
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
