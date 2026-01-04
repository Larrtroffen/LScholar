<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useMainStore } from '../store';
import { 
  Star, 
  Download, 
  CheckSquare, 
  Square,
  Trash2,
  ExternalLink,
  FileJson,
  Library,
  Search,
  Calendar as CalendarIcon,
  Hash,
  Bookmark,
  ArrowDownToLine,
  CheckCircle2
} from 'lucide-vue-next';
import { ElMessage } from 'element-plus';

const store = useMainStore();
const favorites = ref<any[]>([]);
const selectedIds = ref<number[]>([]);
const exporting = ref(false);
const searchQuery = ref('');

const fetchFavorites = async () => {
  const all = await (window as any).electron.ipcRenderer.invoke('get-articles', { limit: 1000 });
  favorites.value = all.filter((a: any) => a.is_favorited);
};

onMounted(fetchFavorites);

const filteredFavorites = computed(() => {
  if (!searchQuery.value) return favorites.value;
  const q = searchQuery.value.toLowerCase();
  return favorites.value.filter(a => 
    a.title?.toLowerCase().includes(q) || 
    a.authors?.toLowerCase().includes(q)
  );
});

const toggleSelect = (id: number) => {
  const index = selectedIds.value.indexOf(id);
  if (index > -1) {
    selectedIds.value.splice(index, 1);
  } else {
    selectedIds.value.push(id);
  }
};

const selectAll = () => {
  if (selectedIds.value.length === filteredFavorites.value.length && filteredFavorites.value.length > 0) {
    selectedIds.value = [];
  } else {
    selectedIds.value = filteredFavorites.value.map(f => f.id);
  }
};

const exportToZotero = async () => {
  if (selectedIds.value.length === 0) return ElMessage.warning('请先选择要导出的文献');
  exporting.value = true;
  try {
    const result = await (window as any).electron.ipcRenderer.invoke('export-to-ris', JSON.parse(JSON.stringify(selectedIds.value)));
    if (result.success) {
      ElMessage.success('文献已成功导出为 RIS 格式');
    }
  } catch (error: any) {
    ElMessage.error(`导出失败: ${error.message}`);
  } finally {
    exporting.value = false;
  }
};

const removeFromFavorites = async (id: number) => {
  try {
    await (window as any).electron.ipcRenderer.invoke('toggle-favorite', { id, isFavorited: false });
    favorites.value = favorites.value.filter(f => f.id !== id);
    selectedIds.value = selectedIds.value.filter(sid => sid !== id);
    ElMessage.success('已从收藏中移除');
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
</script>

<template>
  <div class="p-10 h-full flex flex-col bg-[var(--bg-main)] overflow-hidden">
    <header class="flex justify-between items-end mb-10 shrink-0">
      <div>
        <div class="flex items-center gap-3 mb-2">
          <div class="w-10 h-10 bg-[var(--warning)]/10 rounded-xl flex items-center justify-center text-[var(--warning)] shadow-sm border border-[var(--warning)]/20">
            <Bookmark :size="20" fill="currentColor" />
          </div>
          <h1 class="text-2xl font-bold text-[var(--text-main)]">我的收藏</h1>
        </div>
        <p class="text-xs text-[var(--text-muted)] font-medium uppercase tracking-widest">Curated Academic Collection</p>
      </div>
      
      <div class="flex items-center gap-4">
        <div class="relative">
          <Search class="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" :size="16" />
          <input 
            v-model="searchQuery"
            type="text" 
            placeholder="在收藏中搜索..." 
            class="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl py-2 pl-11 pr-4 text-xs focus:ring-2 focus:ring-[var(--accent)]/50 outline-none transition-all w-64 font-medium text-[var(--text-main)] placeholder:text-[var(--text-muted)]"
          />
        </div>
        <el-button @click="selectAll" class="!h-10 !px-5 !rounded-xl !bg-[var(--bg-card)] !border-[var(--border)] !text-[var(--text-muted)] hover:!text-[var(--text-main)] !text-xs !font-bold uppercase tracking-widest">
          <template #icon>
            <component :is="selectedIds.length === filteredFavorites.length && filteredFavorites.length > 0 ? CheckSquare : Square" :size="16" class="mr-2" />
          </template>
          {{ selectedIds.length === filteredFavorites.length && filteredFavorites.length > 0 ? '取消全选' : '全选' }}
        </el-button>
        <el-button 
          type="primary" 
          @click="exportToZotero" 
          :disabled="selectedIds.length === 0"
          :loading="exporting"
          class="!h-10 !px-6 !rounded-xl !font-bold !text-xs shadow-lg shadow-[var(--accent)]/20 uppercase tracking-widest"
        >
          <ArrowDownToLine :size="18" class="mr-2" /> 导出至 Zotero
        </el-button>
      </div>
    </header>

    <div class="flex-1 overflow-y-auto pr-4 custom-scrollbar">
      <div v-if="favorites.length === 0" class="h-full flex flex-col items-center justify-center text-[var(--text-muted)] border-2 border-dashed border-[var(--border)] rounded-3xl bg-[var(--bg-card)]/50">
        <Library :size="64" class="mb-4 opacity-10" />
        <h3 class="text-lg font-bold uppercase tracking-widest mb-2">收藏库空空如也</h3>
        <p class="text-xs max-w-xs text-center leading-relaxed opacity-60">
          在仪表盘中点击文献卡片上的星标，即可将其添加到此处进行统一管理。
        </p>
      </div>

      <div v-else class="space-y-4">
        <div 
          v-for="article in filteredFavorites" 
          :key="article.id"
          @click="toggleSelect(article.id)"
          class="bg-[var(--bg-card)] p-6 rounded-2xl border border-[var(--border)] hover:border-[var(--accent)]/50 transition-all flex items-center gap-6 cursor-pointer group relative shadow-sm"
          :class="selectedIds.includes(article.id) ? 'ring-2 ring-[var(--accent)] border-transparent bg-[var(--accent)]/[0.02]' : ''"
        >
          <div 
            class="w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all shrink-0"
            :class="selectedIds.includes(article.id) ? 'bg-[var(--accent)] border-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/30' : 'border-[var(--border)] text-transparent group-hover:border-[var(--accent)]'"
          >
            <CheckCircle2 v-if="selectedIds.includes(article.id)" :size="14" />
          </div>

          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-3 mb-2">
              <span class="text-[10px] font-bold text-[var(--text-muted)] flex items-center gap-1.5 uppercase tracking-widest">
                <CalendarIcon :size="12" /> {{ article.publication_date }}
              </span>
              <span class="text-[10px] font-bold text-[var(--text-muted)] flex items-center gap-1.5 uppercase tracking-widest truncate max-w-[200px]">
                <Hash :size="12" /> {{ getJournalName(article.journal_info) }}
              </span>
            </div>
            <h3 class="text-base font-bold text-[var(--text-main)] mb-1 group-hover:text-[var(--accent)] transition-colors tracking-tight line-clamp-2">
              {{ article.title }}
            </h3>
            <p class="text-xs text-[var(--text-muted)] font-medium mb-2">{{ formatAuthors(article.authors) }}</p>
            <p class="text-xs text-[var(--text-muted)] line-clamp-2 italic opacity-80">{{ article.abstract }}</p>
          </div>

          <div class="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
            <button 
              @click.stop="openExternal(article.url)"
              class="p-2.5 bg-[var(--bg-main)] text-[var(--text-muted)] hover:text-[var(--text-main)] rounded-xl transition-all border border-[var(--border)] shadow-inner"
              title="查看原文"
            >
              <ExternalLink :size="18" />
            </button>
            <button 
              @click.stop="removeFromFavorites(article.id)"
              class="p-2.5 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-all shadow-sm"
              title="移出收藏"
            >
              <Trash2 :size="18" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer Stats -->
    <footer v-if="favorites.length > 0" class="mt-8 pt-6 border-t border-[var(--border)] flex items-center justify-between shrink-0">
      <div class="flex items-center gap-8">
        <div class="flex items-baseline gap-2">
          <span class="text-2xl font-bold text-[var(--text-main)] tracking-tight">{{ favorites.length }}</span>
          <span class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Total</span>
        </div>
        <div class="w-px h-6 bg-[var(--border)]"></div>
        <div class="flex items-baseline gap-2">
          <span class="text-2xl font-bold text-[var(--accent)] tracking-tight">{{ selectedIds.length }}</span>
          <span class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Selected</span>
        </div>
      </div>
      <div class="flex items-center gap-2 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest bg-[var(--bg-card)] px-4 py-2 rounded-xl border border-[var(--border)]">
        <FileJson :size="14" class="text-[var(--accent)]" /> RIS Export Engine Ready
      </div>
    </footer>
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
