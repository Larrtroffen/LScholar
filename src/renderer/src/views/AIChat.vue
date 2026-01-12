<script setup lang="ts">
import { ref, nextTick, onMounted, toRaw, computed } from 'vue';
import { useDataStore } from '../store/data';
import MarkdownIt from 'markdown-it';
import { 
  Send, 
  Bot, 
  User, 
  Quote, 
  Sparkles, 
  Trash2, 
  Copy, 
  Check,
  MessageSquare,
  Terminal,
  Cpu,
  Zap,
  History,
  Plus,
  ChevronLeft,
  ChevronRight,
  Clock
} from 'lucide-vue-next';
import { ElMessage } from 'element-plus';

const store = useDataStore();
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true
});

const question = ref('');
const loading = ref(false);
const currentChatId = ref<number | null>(null);
const chatHistory = ref<any[]>([]);
const scrollContainer = ref<HTMLElement | null>(null);
const copiedIndex = ref<number | null>(null);
const isHistoryVisible = ref(true);

onMounted(async () => {
  await store.fetchChatHistory();
});

const scrollToBottom = async () => {
  await nextTick();
  if (scrollContainer.value) {
    scrollContainer.value.scrollTo({
      top: scrollContainer.value.scrollHeight,
      behavior: 'smooth'
    });
  }
};

const askAI = async () => {
  if (!question.value.trim() || loading.value) return;

  const userMsg = question.value;
  chatHistory.value.push({ role: 'user', content: userMsg, time: new Date().toLocaleTimeString() });
  question.value = '';
  loading.value = true;
  await scrollToBottom();

  try {
    const answer = await (window as any).electron.ipcRenderer.invoke('ask-ai', { question: userMsg });
    chatHistory.value.push({ 
      role: 'assistant', 
      content: answer, 
      time: new Date().toLocaleTimeString(),
      references: []
    });
    
    const result = await (window as any).electron.ipcRenderer.invoke('save-chat', {
      id: currentChatId.value,
      title: chatHistory.value[0].content.slice(0, 20) + (chatHistory.value[0].content.length > 20 ? '...' : ''),
      messages: JSON.parse(JSON.stringify(chatHistory.value))
    });
    if (result.success && !currentChatId.value) {
      currentChatId.value = result.id;
    }
    await store.fetchChatHistory();
  } catch (error: any) {
    chatHistory.value.push({ 
      role: 'assistant', 
      content: `系统响应异常: ${error.message}`, 
      isError: true,
      time: new Date().toLocaleTimeString()
    });
  } finally {
    loading.value = false;
    await scrollToBottom();
  }
};

const loadChat = (chat: any) => {
  currentChatId.value = chat.id;
  chatHistory.value = JSON.parse(chat.messages);
  scrollToBottom();
};

const startNewChat = () => {
  currentChatId.value = null;
  chatHistory.value = [];
  ElMessage.success('新会话已开启');
};

const deleteChat = async (id: number) => {
  await (window as any).electron.ipcRenderer.invoke('delete-chat', id);
  await store.fetchChatHistory();
  ElMessage.success('记录已删除');
};

const copyToClipboard = (text: string, index: number) => {
  navigator.clipboard.writeText(text);
  copiedIndex.value = index;
  setTimeout(() => copiedIndex.value = null, 2000);
  ElMessage.success('已复制到剪贴板');
};
</script>

<template>
  <div class="h-full flex bg-[var(--bg-main)] overflow-hidden relative">
    <!-- History Sidebar -->
    <aside 
      class="bg-[var(--bg-sidebar)] border-r border-[var(--border)] transition-all duration-300 flex flex-col shrink-0"
      :style="{ width: isHistoryVisible ? '280px' : '0px', opacity: isHistoryVisible ? 1 : 0 }"
    >
      <div class="p-6 border-b border-[var(--border)] flex items-center justify-between shrink-0">
        <h2 class="font-bold text-sm flex items-center gap-2">
          <History :size="16" /> 历史记录
        </h2>
        <button @click="startNewChat" class="p-1.5 hover:bg-[var(--bg-main)] rounded-lg text-[var(--accent)] transition-all">
          <Plus :size="18" />
        </button>
      </div>
      
      <div class="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
        <div 
          v-for="chat in store.chatHistory" 
          :key="chat.id"
          @click="loadChat(chat)"
          class="p-3 rounded-xl hover:bg-[var(--bg-main)] cursor-pointer group transition-all relative"
        >
          <p class="text-xs font-semibold truncate pr-6">{{ chat.title }}</p>
          <p class="text-[10px] text-[var(--text-muted)] mt-1 flex items-center gap-1">
            <Clock :size="10" /> {{ new Date(chat.created_at).toLocaleDateString() }}
          </p>
          <button 
            @click.stop="deleteChat(chat.id)"
            class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-red-500 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 rounded-md transition-all"
          >
            <Trash2 :size="12" />
          </button>
        </div>
      </div>
    </aside>

    <!-- Main Chat Area -->
    <div class="flex-1 flex flex-col min-w-0 relative">
      <!-- Toggle Sidebar Button -->
      <button 
        @click="isHistoryVisible = !isHistoryVisible"
        class="absolute left-0 top-1/2 -translate-y-1/2 z-20 bg-[var(--bg-card)] border border-[var(--border)] p-1 rounded-r-lg shadow-xl text-[var(--text-muted)] hover:text-[var(--accent)] transition-all"
      >
        <ChevronRight v-if="!isHistoryVisible" :size="16" />
        <ChevronLeft v-else :size="16" />
      </button>

      <!-- Header -->
      <header class="h-16 flex items-center justify-between px-8 border-b border-[var(--border)] shrink-0 bg-[var(--bg-card)]/50 backdrop-blur-md z-10">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 bg-[var(--accent)]/10 rounded-lg flex items-center justify-center text-[var(--accent)]">
            <MessageSquare :size="18" />
          </div>
          <div>
            <h2 class="text-sm font-bold text-[var(--text-main)]">学术 AI 助手</h2>
            <p class="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-widest">Local RAG Engine Active</p>
          </div>
        </div>
      </header>

      <!-- Chat History -->
      <div ref="scrollContainer" class="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
        <div v-if="chatHistory.length === 0" class="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
          <div class="w-20 h-20 bg-gradient-to-br from-[var(--accent)]/20 to-blue-600/10 rounded-3xl flex items-center justify-center text-[var(--accent)] mb-6 shadow-xl border border-[var(--border)]">
            <Sparkles :size="40" />
          </div>
          <h2 class="text-xl font-bold text-[var(--text-main)] mb-3">智能文献问答</h2>
          <p class="text-xs text-[var(--text-muted)] leading-relaxed mb-8">
            基于您的本地文献库进行深度检索与问答。
          </p>
        </div>

        <div 
          v-for="(msg, index) in chatHistory" 
          :key="index"
          class="flex gap-5 max-w-4xl mx-auto group"
          :class="msg.role === 'user' ? 'flex-row-reverse' : ''"
        >
          <div 
            class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-md border border-[var(--border)]"
            :class="msg.role === 'user' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-card)] text-[var(--accent)]'"
          >
            <User v-if="msg.role === 'user'" :size="20" />
            <Bot v-else :size="20" />
          </div>

          <div class="flex flex-col gap-1.5 max-w-[80%]" :class="msg.role === 'user' ? 'items-end' : ''">
            <div 
              class="p-5 rounded-2xl leading-relaxed shadow-sm relative border border-[var(--border)]"
              :class="msg.role === 'user' 
                ? 'bg-[var(--accent)] text-white rounded-tr-none' 
                : 'bg-[var(--bg-card)] text-[var(--text-main)] rounded-tl-none'"
            >
              <div class="markdown-body text-sm font-medium" v-html="md.render(msg.content)"></div>
              
              <div 
                v-if="!msg.isError"
                class="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <button 
                  @click="copyToClipboard(msg.content, index)"
                  class="p-1 rounded-md hover:bg-black/10 transition-colors"
                  :class="msg.role === 'user' ? 'text-white/50' : 'text-[var(--text-muted)]'"
                >
                  <Check v-if="copiedIndex === index" :size="12" />
                  <Copy v-else :size="12" />
                </button>
              </div>
            </div>
            <span class="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest px-1">{{ msg.time }}</span>
          </div>
        </div>

        <div v-if="loading" class="flex gap-5 max-w-4xl mx-auto">
          <div class="w-10 h-10 rounded-xl bg-[var(--bg-card)] text-[var(--accent)] border border-[var(--border)] flex items-center justify-center shadow-md">
            <Bot :size="20" />
          </div>
          <div class="bg-[var(--bg-card)] border border-[var(--border)] p-5 rounded-2xl rounded-tl-none shadow-sm">
            <div class="flex gap-1.5">
              <div class="w-1.5 h-1.5 bg-[var(--accent)] rounded-full animate-bounce"></div>
              <div class="w-1.5 h-1.5 bg-[var(--accent)] rounded-full animate-bounce [animation-delay:0.2s]"></div>
              <div class="w-1.5 h-1.5 bg-[var(--accent)] rounded-full animate-bounce [animation-delay:0.4s]"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Input Area -->
      <div class="p-8 bg-gradient-to-t from-[var(--bg-main)] via-[var(--bg-main)] to-transparent shrink-0">
        <div class="max-w-4xl mx-auto relative">
          <div class="absolute -top-7 left-5 flex items-center gap-2 text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest">
            <Terminal :size="12" /> System Ready
          </div>
          <input 
            v-model="question"
            @keyup.enter="askAI"
            type="text" 
            placeholder="基于您的文献库进行提问..." 
            class="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl py-4 pl-6 pr-16 text-sm font-semibold text-[var(--text-main)] focus:ring-4 focus:ring-[var(--accent)]/10 focus:border-[var(--accent)] outline-none transition-all shadow-xl placeholder:text-[var(--text-muted)]"
          />
          <button 
            @click="askAI"
            :disabled="loading || !question.trim()"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 w-11 h-11 bg-[var(--accent)] text-white rounded-xl flex items-center justify-center hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-[var(--accent)]/20"
          >
            <Send :size="20" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  @apply bg-[var(--border)] rounded-full;
}

.markdown-body {
  @apply leading-relaxed;
}
.markdown-body :deep(p) {
  @apply mb-4 last:mb-0;
}
.markdown-body :deep(h1), .markdown-body :deep(h2), .markdown-body :deep(h3) {
  @apply font-bold mb-4 mt-6 first:mt-0;
}
.markdown-body :deep(h1) { @apply text-xl; }
.markdown-body :deep(h2) { @apply text-lg; }
.markdown-body :deep(h3) { @apply text-base; }
.markdown-body :deep(ul), .markdown-body :deep(ol) {
  @apply mb-4 pl-6;
}
.markdown-body :deep(ul) { @apply list-disc; }
.markdown-body :deep(ol) { @apply list-decimal; }
.markdown-body :deep(li) { @apply mb-1; }
.markdown-body :deep(code) {
  @apply px-1.5 py-0.5 rounded bg-black/10 font-mono text-[0.9em];
}
.markdown-body :deep(pre) {
  @apply p-4 rounded-xl bg-black/20 overflow-x-auto mb-4;
}
.markdown-body :deep(pre code) {
  @apply p-0 bg-transparent;
}
.markdown-body :deep(blockquote) {
  @apply border-l-4 border-[var(--border)] pl-4 italic my-4;
}
.markdown-body :deep(table) {
  @apply w-full border-collapse mb-4;
}
.markdown-body :deep(th), .markdown-body :deep(td) {
  @apply border border-[var(--border)] p-2 text-left;
}
.markdown-body :deep(th) {
  @apply bg-black/5;
}

/* User message specific markdown styles */
.flex-row-reverse .markdown-body :deep(code) {
  @apply bg-white/20;
}
.flex-row-reverse .markdown-body :deep(pre) {
  @apply bg-white/10;
}
</style>
