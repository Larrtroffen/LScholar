<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import { useMainStore } from '../store';
import { 
  Search, 
  Star, 
  ExternalLink, 
  ChevronRight,
  FolderPlus,
  Filter,
  Clock,
  BookOpen,
  Hash,
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

const store = useMainStore();
const searchQuery = ref('');
const selectedFeedId = ref<number | null>(null);
const selectedGroupId = ref<number | null>(null);
const loading = ref(false);
const translating = ref(false);
const isDetailsVisible = ref(true);
const detailsWidth = ref(400);

const fetchArticles = async () => {
  loading.value = true;
  try {
    await store.fetchArticles({
      feedId: selectedFeedId.value,
      groupId: selectedGroupId.value,
      limit: 100
    });
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  fetchArticles();
  store.fetchGroups();
  store.fetchFeeds();
});
watch([selectedFeedId, selectedGroupId], fetchArticles);

const filteredArticles = computed(() => {
  if (!searchQuery.value) return store.articles;
  const q = searchQuery.value.toLowerCase();
  return store.articles.filter(a => 
    a.title?.toLowerCase().includes(q) || 
    a.abstract?.toLowerCase().includes(q) ||
    a.authors?.toLowerCase().includes(q)
  );
});

const selectArticle = (article: any) => {
  store.selectedArticle = article;
  isDetailsVisible.value = true;
};

const toggleFavorite = async (article: any) => {
  try {
    await (window as any).electron.ipcRenderer.invoke('toggle-favorite', {
      id: article.id,
      isFavorited: !article.is_favorited
    });
    article.is_favorited = !article.is_favorited;
    ElMessage({
      message: article.is_favorited ? '已添加到收藏' : '已从收藏移除',
      type: 'success',
      plain: true,
    });
  } catch (error: any) {
    ElMessage.error(error.message);
  }
};

const formatAuthors = (authorsJson: string) => {
  try {
    const authors = JSON.parse(authorsJson);
    return Array.isArray(authors) ? authors.join(', ') : authors;
  } catch {
    return authorsJson;
  }
};

const getJournalName = (info: string) => {
  try {
    return JSON.parse(info).name;
  } catch {
    return '未知期刊';
  }
};

const openExternal = (url: string) => {
  if (url) (window as any).electron.shell.openExternal(url);
};

const translateArticle = async () => {
  if (!store.selectedArticle || translating.value) return;
  translating.value = true;
  try {
    const result = await (window as any).electron.ipcRenderer.invoke('translate-article', {
      articleId: store.selectedArticle.id
    });
    if (result.success) {
      store.selectedArticle.trans_title = result.trans_title;
      store.selectedArticle.trans_abstract = result.trans_abstract;
      ElMessage.success('翻译完成');
    }
  } catch (error: any) {
    ElMessage.error('翻译失败: ' + error.message);
  } finally {
    translating.value = false;
  }
};

const toggleTranslation = async () => {
  store.settings.translation_enabled = !store.settings.translation_enabled;
  await (window as any).electron.ipcRenderer.invoke('save-settings', { ...store.settings });
};

// 详情栏拖拽逻辑
const handleAddGroup = () => {
  ElMessageBox.prompt('请输入新分组名称', '新建分组', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    inputPattern: /\S+/,
    inputErrorMessage: '分组名称不能为空'
  }).then(async ({ value }) => {
    try {
      await store.addGroup(value);
      ElMessage.success('分组创建成功');
    } catch (error: any) {
      ElMessage.error('创建失败: ' + error.message);
    }
  }).catch(() => {});
};

const handleDeleteGroup = async (groupId: number) => {
  try {
    await ElMessageBox.confirm('确定要删除这个分组吗？分组内的订阅源将被设为未分类。', '删除分组', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    });
    await (window as any).electron.ipcRenderer.invoke('delete-group', groupId);
    await store.fetchGroups();
    await store.fetchFeeds();
    if (selectedGroupId.value === groupId) selectedGroupId.value = null;
    ElMessage.success('分组已删除');
  } catch (error) {}
};

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
            <span class="ml-auto text-[10px] opacity-50">{{ store.articles.length }}</span>
          </button>
        </nav>

        <div class="mt-10 flex items-center justify-between mb-6">
          <h2 class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">我的分组</h2>
          <button 
            @click="handleAddGroup"
            class="p-1.5 hover:bg-[var(--bg-card)] rounded-lg text-[var(--text-muted)] transition-all"
          >
            <FolderPlus :size="14" />
          </button>
        </div>
        
        <div class="space-y-6">
          <!-- Unclassified -->
          <div>
            <h3 class="px-3 mb-2 text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest opacity-50">未分类</h3>
            <nav class="space-y-1">
              <button 
                v-for="feed in store.feeds.filter(f => !f.group_id)" 
                :key="feed.id"
                @click="selectedFeedId = feed.id; selectedGroupId = null"
                class="w-full flex items-center px-3 py-2 rounded-xl text-sm transition-all duration-200 truncate group"
                :class="selectedFeedId === feed.id ? 'bg-[var(--accent)]/10 text-[var(--accent)] font-semibold' : 'text-[var(--text-muted)] hover:bg-[var(--bg-card)] hover:text-[var(--text-main)]'"
                :title="feed.name"
              >
                <div class="w-1.5 h-1.5 rounded-full bg-[var(--border)] mr-3 group-hover:bg-[var(--accent)] transition-colors shrink-0" :class="selectedFeedId === feed.id ? 'bg-[var(--accent)]' : ''"></div>
                <span class="truncate">{{ feed.name }}</span>
              </button>
            </nav>
          </div>

          <!-- Classified Groups -->
          <div v-for="group in store.groups" :key="group.id" class="group/folder">
            <div class="flex items-center justify-between mb-2 pr-2">
              <button 
                @click="selectedGroupId = group.id; selectedFeedId = null"
                class="flex-1 flex items-center px-3 text-[9px] font-bold uppercase tracking-widest transition-colors hover:text-[var(--accent)] truncate"
                :class="selectedGroupId === group.id ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'"
                :title="group.name"
              >
                <Layers :size="12" class="mr-2 opacity-50 shrink-0" />
                <span class="truncate">{{ group.name }}</span>
              </button>
              <button 
                @click.stop="handleDeleteGroup(group.id)"
                class="opacity-0 group-hover/folder:opacity-100 p-1 hover:bg-red-500/10 hover:text-red-500 rounded transition-all"
              >
                <Trash2 :size="10" />
              </button>
            </div>
            <nav class="space-y-1 ml-2 border-l border-[var(--border)] pl-2">
              <button 
                v-for="feed in store.feeds.filter(f => f.group_id === group.id)" 
                :key="feed.id"
                @click="selectedFeedId = feed.id; selectedGroupId = null"
                class="w-full flex items-center px-3 py-1.5 rounded-lg text-xs transition-all duration-200 group/item"
                :class="selectedFeedId === feed.id ? 'bg-[var(--accent)]/10 text-[var(--accent)] font-semibold' : 'text-[var(--text-muted)] hover:bg-[var(--bg-card)] hover:text-[var(--text-main)]'"
                :title="feed.name"
              >
                <span class="truncate">{{ feed.name }}</span>
              </button>
            </nav>
          </div>
        </div>
      </div>
    </div>

    <!-- Middle Column: Article List -->
    <div class="flex-1 flex flex-col bg-[var(--bg-main)] min-w-0">
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
        <div v-if="loading" class="flex flex-col items-center justify-center h-64 space-y-4 opacity-50">
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
          @click="selectArticle(article)"
          class="bg-[var(--bg-card)] p-5 rounded-2xl border border-[var(--border)] hover:border-[var(--accent)]/50 cursor-pointer transition-all group relative"
          :class="store.selectedArticle?.id === article.id ? 'ring-2 ring-[var(--accent)] border-transparent' : ''"
        >
          <div class="flex justify-between items-start mb-2">
            <h3 class="font-bold text-base text-[var(--text-main)] leading-snug pr-10 group-hover:text-[var(--accent)] transition-colors line-clamp-2">
              <template v-if="store.settings.translation_enabled && article.trans_title">
                <template v-if="store.settings.translation_mode === 'replace'">
                  {{ article.trans_title }}
                </template>
                <template v-else>
                  {{ article.title }} <span class="text-[var(--accent)] ml-1">[{{ article.trans_title }}]</span>
                </template>
              </template>
              <template v-else>
                {{ article.title }}
              </template>
            </h3>
            <button 
              @click.stop="toggleFavorite(article)"
              class="absolute top-5 right-5 p-1.5 rounded-lg hover:bg-[var(--bg-main)] transition-all"
              :class="article.is_favorited ? 'text-[var(--warning)]' : 'text-[var(--text-muted)] hover:text-[var(--warning)]'"
            >
              <Star :size="18" :fill="article.is_favorited ? 'currentColor' : 'none'" />
            </button>
          </div>
          
          <p class="text-xs text-[var(--text-muted)] mb-4 line-clamp-1 font-medium">{{ formatAuthors(article.authors) }}</p>
          
          <div class="flex items-center gap-4 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
            <span class="flex items-center gap-1.5"><CalendarIcon :size="12" /> {{ article.publication_date }}</span>
            <span class="flex items-center gap-1.5 truncate max-w-[200px]"><Hash :size="12" /> {{ getJournalName(article.journal_info) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Right Column: Details (Resizable) -->
    <div 
      v-if="isDetailsVisible && store.selectedArticle"
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
          <div class="flex items-center bg-[var(--bg-main)] rounded-lg p-1 border border-[var(--border)]">
            <button 
              @click="toggleTranslation"
              class="p-1.5 rounded-md transition-all flex items-center gap-1.5"
              :class="store.settings.translation_enabled ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'"
            >
              <Languages :size="14" />
              <span class="text-[10px] font-bold uppercase tracking-wider">{{ store.settings.translation_enabled ? '翻译显示开' : '翻译显示关' }}</span>
            </button>
          </div>
        </div>
        <button @click="isDetailsVisible = false" class="p-1.5 hover:bg-[var(--bg-main)] rounded-lg text-[var(--text-muted)]">
          <ChevronRight :size="18" />
        </button>
      </header>

      <div class="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
        <div>
          <div class="flex items-center gap-3 mb-4">
            <span class="bg-[var(--success)]/10 text-[var(--success)] text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-widest">Published</span>
            <span class="text-[var(--text-muted)] text-[10px] font-bold uppercase tracking-widest">DOI: {{ store.selectedArticle.doi || 'N/A' }}</span>
          </div>
          <h2 class="text-xl font-bold text-[var(--text-main)] leading-tight mb-6">
            <template v-if="store.settings.translation_enabled && store.selectedArticle.trans_title">
              <template v-if="store.settings.translation_mode === 'replace'">
                {{ store.selectedArticle.trans_title }}
              </template>
              <template v-else>
                {{ store.selectedArticle.title }}
                <div class="text-base text-[var(--accent)] mt-2 font-semibold">[{{ store.selectedArticle.trans_title }}]</div>
              </template>
            </template>
            <template v-else>
              {{ store.selectedArticle.title }}
            </template>
          </h2>
        </div>
        
        <div class="space-y-8">
          <section>
            <div class="flex justify-between items-center mb-3">
              <h4 class="text-[10px] font-bold text-[var(--accent)] uppercase tracking-widest flex items-center gap-2">
                <User :size="14" /> 作者
              </h4>
              <el-button 
                v-if="!store.selectedArticle.trans_title"
                @click="translateArticle" 
                :loading="translating"
                class="!h-7 !px-3 !rounded-lg !text-[9px] !font-bold !bg-[var(--accent)]/10 !text-[var(--accent)] !border-none uppercase tracking-widest"
              >
                <Languages :size="12" class="mr-1.5" /> 一键翻译
              </el-button>
            </div>
            <p class="text-sm text-[var(--text-main)] leading-relaxed font-semibold">{{ formatAuthors(store.selectedArticle.authors) }}</p>
          </section>

          <section>
            <h4 class="text-[10px] font-bold text-[var(--accent)] uppercase tracking-widest mb-3 flex items-center gap-2">
              <BookOpen :size="14" /> 摘要
            </h4>
            <div class="bg-[var(--bg-main)] p-5 rounded-2xl border border-[var(--border)]">
              <p class="text-sm text-[var(--text-muted)] leading-relaxed text-justify italic">
                <template v-if="store.settings.translation_enabled && store.selectedArticle.trans_abstract">
                  <template v-if="store.settings.translation_mode === 'replace'">
                    {{ store.selectedArticle.trans_abstract }}
                  </template>
                  <template v-else>
                    {{ store.selectedArticle.abstract }}
                    <hr class="my-4 border-[var(--border)] opacity-50" />
                    <span class="text-[var(--accent)] not-italic">{{ store.selectedArticle.trans_abstract }}</span>
                  </template>
                </template>
                <template v-else>
                  {{ store.selectedArticle.abstract }}
                </template>
              </p>
            </div>
          </section>

          <div class="grid grid-cols-1 gap-4">
            <div class="bg-[var(--bg-main)] p-4 rounded-xl border border-[var(--border)]">
              <h4 class="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1">发表日期</h4>
              <p class="text-sm font-bold text-[var(--text-main)]">{{ store.selectedArticle.publication_date }}</p>
            </div>
          </div>

          <div class="pt-6 sticky bottom-0 bg-gradient-to-t from-[var(--bg-card)] via-[var(--bg-card)] to-transparent pb-4">
            <button 
              @click="openExternal(store.selectedArticle.url)"
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
      v-if="!isDetailsVisible && store.selectedArticle"
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
