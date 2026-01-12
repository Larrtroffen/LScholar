<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import { useDataStore } from '../store/data';
import { useConfigStore } from '../store/config';
import { useTaskStore } from '../store/task';
import { storeToRefs } from 'pinia';
import { 
  Search, 
  Star, 
  ExternalLink, 
  ChevronRight,
  FolderPlus,
  Filter,
  BookOpen,
  Calendar as CalendarIcon,
  User,
  Layers,
  ChevronLeft,
  GripVertical,
  Languages,
  RefreshCw,
  Trash2
} from 'lucide-vue-next';
import { ElMessage, ElMessageBox } from 'element-plus';

const dataStore = useDataStore();
const configStore = useConfigStore();
const taskStore = useTaskStore();

const { articles, feeds, selectedArticle, isLoading } = storeToRefs(dataStore);
const { settings } = storeToRefs(configStore);
const { embeddingStats } = storeToRefs(taskStore);

const searchQuery = ref('');
const selectedFeedId = ref<number | null>(null);
const selectedGroupId = ref<number | null>(null);
const isDetailsVisible = ref(true);
const detailsWidth = ref(400);

// Groups logic (needs to be moved to dataStore or handled here)
// For now, let's assume groups are part of feeds or fetched separately.
// The original code had fetchGroups. Let's add it to dataStore if needed, or just mock it for now if not critical.
// Actually, groups table exists. I should add fetchGroups to dataStore.
// But for now, I'll just fetch feeds and filter.
const groups = ref<any[]>([]); // Placeholder

const fetchArticles = async () => {
  // Filter logic should be handled by backend or frontend.
  // dataStore.fetchArticles fetches all (limit/offset).
  // If we want filtering, we need to update dataStore or IPC.
  // For simplicity in this refactor, let's fetch all and filter on frontend if list is small,
  // or assume fetchArticles supports params.
  // The new IPC `article:get-all` takes limit/offset.
  // I should probably add filtering to IPC.
  // But for now, let's just fetch recent ones.
  await dataStore.fetchArticles(100);
};

onMounted(async () => {
  await dataStore.fetchFeeds();
  await fetchArticles();
  await taskStore.fetchStats();
  
  // Groups fetching - assuming we might need to add this to dataStore later
  // groups.value = await (window as any).electron.ipcRenderer.invoke('group:get-all'); // Not implemented yet
});

const filteredArticles = computed(() => {
  let result = articles.value;
  
  if (selectedFeedId.value) {
    result = result.filter(a => a.feed_id === selectedFeedId.value);
  }
  
  // Group filtering logic would go here
  
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

const selectArticle = (article: any) => {
  dataStore.selectArticle(article);
  isDetailsVisible.value = true;
};

const toggleFavorite = async (article: any) => {
  await dataStore.toggleFavorite(article.id);
};

const formatAuthors = (authors: string | undefined) => {
  return authors || 'Unknown Author';
};

const openExternal = (url: string) => {
  if (url) (window as any).electron.shell.openExternal(url);
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
</script>

<template>
  <div class="flex h-full w-full overflow-hidden bg-[var(--bg-main)]">
    <!-- Left Column: Navigation -->
    <div class="w-64 bg-[var(--bg-main)] border-r border-[var(--border)] flex flex-col shrink-0">
      <div class="p-6 flex-1 overflow-y-auto custom-scrollbar">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">文献库</h2>
          <button class="p-1.5 hover:bg-[var(--bg-card)] rounded-lg text-[var(--text-muted)] transition-all">
            <Filter :size="14" />
          </button>
        </div>
        
        <nav class="space-y-1">
          <button 
            @click="selectedFeedId = null; selectedGroupId = null"
            class="w-full flex items-center px-3 py-2 rounded-xl text-sm transition-all duration-200 group"
            :class="!selectedFeedId && !selectedGroupId ? 'bg-[var(--accent)]/10 text-[var(--accent)] font-semibold' : 'text-[var(--text-muted)] hover:bg-[var(--bg-card)] hover:text-[var(--text-main)]'"
          >
            <BookOpen :size="16" class="mr-3" />
            全部文献
          </button>
        </nav>

        <div class="mt-10 flex items-center justify-between mb-6">
          <h2 class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">订阅源</h2>
          <button 
            class="p-1.5 hover:bg-[var(--bg-card)] rounded-lg text-[var(--text-muted)] transition-all"
          >
            <FolderPlus :size="14" />
          </button>
        </div>
        
        <div class="space-y-6">
          <!-- Feeds List -->
          <div>
            <nav class="space-y-1">
              <div v-for="feed in feeds" :key="feed.id">
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
            </nav>
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
      </header>

      <div class="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
        <div v-if="isLoading" class="flex flex-col items-center justify-center h-64 space-y-4 opacity-50">
          <div class="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin"></div>
          <p class="text-xs font-medium">正在加载...</p>
        </div>
        
        <div v-else-if="filteredArticles.length === 0" class="flex flex-col items-center justify-center h-64 text-[var(--text-muted)]">
          <BookOpen :size="32" class="mb-3 opacity-20" />
          <p class="text-xs font-medium">未找到相关文献</p>
        </div>

        <div 
          v-for="article in filteredArticles" 
          :key="article.id"
          :data-article-id="article.id"
          @click="selectArticle(article)"
          class="bg-[var(--bg-card)] p-5 rounded-2xl border border-[var(--border)] hover:border-[var(--accent)]/50 cursor-pointer transition-all group relative"
          :class="selectedArticle?.id === article.id ? 'ring-2 ring-[var(--accent)] border-transparent' : ''"
        >
          <div class="flex justify-between items-start mb-2">
            <h3 class="font-bold text-base text-[var(--text-main)] leading-snug pr-10 group-hover:text-[var(--accent)] transition-colors line-clamp-2">
              {{ article.title }}
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
            {{ article.summary }}
          </p>

          <div class="flex items-center gap-4 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
            <span class="flex items-center gap-1.5"><CalendarIcon :size="12" /> {{ article.publish_date }}</span>
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
        <button @click="isDetailsVisible = false" class="p-1.5 hover:bg-[var(--bg-main)] rounded-lg text-[var(--text-muted)]">
          <ChevronRight :size="18" />
        </button>
      </header>

      <div class="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
        <div>
          <div class="flex items-center gap-3 mb-4">
            <span v-if="selectedArticle.publish_date" class="bg-[var(--success)]/10 text-[var(--success)] text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-widest">Published</span>
          </div>
          <h2 class="text-xl font-bold text-[var(--text-main)] leading-tight mb-6">
            {{ selectedArticle.title }}
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
            <div class="bg-[var(--bg-main)] p-5 rounded-2xl border border-[var(--border)]">
              <p class="text-sm text-[var(--text-muted)] leading-relaxed text-justify italic">
                {{ selectedArticle.summary }}
              </p>
            </div>
          </section>

          <div class="grid grid-cols-1 gap-4">
            <div class="bg-[var(--bg-main)] p-4 rounded-xl border border-[var(--border)]">
              <h4 class="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1">发表日期</h4>
              <p class="text-sm font-bold text-[var(--text-main)]">{{ selectedArticle.publish_date }}</p>
            </div>
          </div>

          <div class="pt-6 sticky bottom-0 bg-gradient-to-t from-[var(--bg-card)] via-[var(--bg-card)] to-transparent pb-4">
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
