<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useMainStore } from './store';
import { 
  LayoutDashboard, 
  Rss, 
  MessageSquare, 
  Calendar, 
  Star, 
  Settings as SettingsIcon,
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon
} from 'lucide-vue-next';
import Dashboard from './views/Dashboard.vue';
import Feeds from './views/Feeds.vue';
import AIChat from './views/AIChat.vue';
import Insights from './views/Insights.vue';
import Favorites from './views/Favorites.vue';
import Settings from './views/Settings.vue';

const store = useMainStore();
const currentView = ref('dashboard');
const initError = ref<string | null>(null);
const isSidebarCollapsed = ref(false);

const menuItems = [
  { id: 'dashboard', name: '仪表盘', icon: LayoutDashboard },
  { id: 'feeds', name: '订阅源', icon: Rss },
  { id: 'aichat', name: 'AI问答', icon: MessageSquare },
  { id: 'insights', name: '每日洞察', icon: Calendar },
  { id: 'favorites', name: '我的收藏', icon: Star },
  { id: 'settings', name: '设置', icon: SettingsIcon },
];

onMounted(async () => {
  store.initTheme();
  if (!(window as any).electron) {
    initError.value = 'Electron API not found. Preload script might have failed to load.';
    return;
  }
  try {
    await store.fetchSettings();
    await store.fetchFeeds();
    await store.fetchGroups();
  } catch (error: any) {
    console.error('Failed to fetch initial data:', error);
    initError.value = `Failed to fetch initial data: ${error.message}`;
  }
});

const reload = () => window.location.reload();
</script>

<template>
  <div class="flex h-screen w-screen overflow-hidden bg-[var(--bg-main)] text-[var(--text-main)] selection:bg-blue-500/30">
    <!-- Sidebar -->
    <aside 
      class="flex flex-col bg-[var(--bg-sidebar)] border-r border-[var(--border)] transition-all duration-300 ease-in-out z-50 shrink-0 relative"
      :style="{ width: isSidebarCollapsed ? '72px' : '240px' }"
    >
      <!-- Logo Area -->
      <div class="h-16 flex items-center px-5 mb-4 shrink-0">
        <div class="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center text-white shadow-lg shrink-0">
          <span class="font-bold text-sm tracking-tighter">LS</span>
        </div>
        <div 
          class="ml-3 overflow-hidden whitespace-nowrap transition-all duration-300"
          :class="isSidebarCollapsed ? 'opacity-0 w-0' : 'opacity-100 w-auto'"
        >
          <h1 class="font-bold text-base text-[var(--text-main)] tracking-tight">LScholar</h1>
          <p class="text-[9px] text-[var(--text-muted)] uppercase font-bold tracking-widest">Academic Hub</p>
        </div>
      </div>
      
      <!-- Navigation -->
      <nav class="flex-1 px-3 space-y-1 overflow-y-auto custom-scrollbar">
        <button 
          v-for="item in menuItems" 
          :key="item.id"
          @click="currentView = item.id"
          class="w-full flex items-center p-2.5 rounded-xl transition-all duration-200 group relative overflow-hidden"
          :class="currentView === item.id 
            ? 'bg-blue-500/10 text-blue-500' 
            : 'text-[var(--text-muted)] hover:bg-[var(--bg-main)] hover:text-[var(--text-main)]'"
        >
          <div class="relative z-10 flex items-center">
            <component :is="item.icon" :size="20" :stroke-width="currentView === item.id ? 2.5 : 2" />
            <span 
              class="ml-3 font-semibold text-sm transition-all duration-300 whitespace-nowrap overflow-hidden"
              :class="isSidebarCollapsed ? 'opacity-0 w-0' : 'opacity-100 w-auto'"
            >
              {{ item.name }}
            </span>
          </div>
          
          <div 
            v-if="currentView === item.id" 
            class="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-r-full"
          ></div>

          <div 
            v-if="isSidebarCollapsed"
            class="absolute left-full ml-4 px-3 py-2 bg-[var(--bg-sidebar)] text-[var(--text-main)] text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-[100] shadow-xl border border-[var(--border)] transition-opacity font-bold"
          >
            {{ item.name }}
          </div>
        </button>
      </nav>

      <!-- Sidebar Footer -->
      <div class="p-3 border-t border-[var(--border)] shrink-0 space-y-1">
        <button 
          @click="store.toggleTheme()"
          class="w-full flex items-center p-2.5 rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-main)] hover:text-[var(--text-main)] transition-all"
        >
          <Sun v-if="store.theme === 'dark'" :size="20" />
          <Moon v-else :size="20" />
          <span class="ml-3 font-semibold text-sm transition-all duration-300 overflow-hidden whitespace-nowrap" :class="isSidebarCollapsed ? 'opacity-0 w-0' : 'opacity-100 w-auto'">{{ store.theme === 'dark' ? '浅色模式' : '深色模式' }}</span>
        </button>
        <button 
          @click="isSidebarCollapsed = !isSidebarCollapsed"
          class="w-full flex items-center p-2.5 rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-main)] hover:text-[var(--text-main)] transition-all"
        >
          <ChevronLeft v-if="!isSidebarCollapsed" :size="20" />
          <ChevronRight v-else :size="20" />
          <span class="ml-3 font-semibold text-sm transition-all duration-300 overflow-hidden whitespace-nowrap" :class="isSidebarCollapsed ? 'opacity-0 w-0' : 'opacity-100 w-auto'">收起侧边栏</span>
        </button>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="flex-1 overflow-hidden relative flex flex-col bg-[var(--bg-main)]">
      <!-- Error Overlay -->
      <Transition name="fade">
        <div v-if="initError" class="absolute inset-0 z-[100] bg-[var(--bg-main)]/95 backdrop-blur-xl flex items-center justify-center p-10">
          <div class="bg-[var(--bg-card)] border border-red-500/30 p-8 rounded-2xl max-w-lg shadow-2xl text-center">
            <div class="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 mx-auto mb-6">
              <AlertCircle :size="32" />
            </div>
            <h2 class="text-[var(--text-main)] font-bold text-xl mb-3">初始化失败</h2>
            <p class="text-[var(--text-muted)] font-mono text-xs break-all mb-8 leading-relaxed">{{ initError }}</p>
            <button 
              @click="reload" 
              class="w-full bg-blue-500 hover:opacity-90 text-white font-bold py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-3"
            >
              <RefreshCw :size="18" /> 重新尝试
            </button>
          </div>
        </div>
      </Transition>

      <!-- View Container -->
      <div class="flex-1 relative overflow-hidden">
        <Transition name="fade" mode="out-in">
          <component :is="{
            dashboard: Dashboard,
            feeds: Feeds,
            aichat: AIChat,
            insights: Insights,
            favorites: Favorites,
            settings: Settings
          }[currentView]" />
        </Transition>
      </div>
    </main>
  </div>
</template>
