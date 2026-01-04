<script setup lang="ts">
import { ref, toRaw, onMounted } from 'vue';
import { useMainStore } from '../store';
import { ElMessage, ElMessageBox } from 'element-plus';
import IntervalSlider from '../components/IntervalSlider.vue';
import { 
  Plus, 
  Settings, 
  Trash2, 
  Wand2, 
  Play, 
  Rss, 
  Globe, 
  Code2, 
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Activity,
  Terminal,
  RefreshCw,
  Clock
} from 'lucide-vue-next';

const store = useMainStore();
const showAddModal = ref(false);
const isEditing = ref(false);
const adding = ref(false);
const updatingAll = ref(false);
const updateProgress = ref({ current: 0, total: 0, percent: 0 });
const generatingScript = ref(false);
const debugging = ref(false);
const debugResult = ref<any>(null);

const defaultScript = `function parse(rssText) {\n  // 使用 DOMParser 解析 XML\n  const parser = new DOMParser();\n  const xmlDoc = parser.parseFromString(rssText, "text/xml");\n  const items = xmlDoc.querySelectorAll("item, entry");\n  \n  return Array.from(items).map(item => {\n    // 兼容 RSS 和 Atom 格式\n    const title = item.querySelector("title")?.textContent || "";\n    const authors = Array.from(item.querySelectorAll("author name, author, dc\\\\:creator")).map(a => a.textContent);\n    const abstract = item.querySelector("description, summary, content")?.textContent || "";\n    const url = item.querySelector("link")?.getAttribute("href") || item.querySelector("link")?.textContent || "";\n    const date = item.querySelector("pubDate, updated, published")?.textContent || "";\n    \n    return {\n      title: title.trim(),\n      authors: authors.length > 0 ? authors : ["Unknown"],\n      abstract: abstract.trim(),\n      url: url.trim(),\n      publication_date: date.trim()\n    };\n  });\n}`;

const intervalOptions = [
  { label: '12小时', value: 12, cron: '0 */12 * * *' },
  { label: '24小时', value: 24, cron: '0 0 * * *' },
  { label: '2天', value: 48, cron: '0 0 */2 * *' },
  { label: '3天', value: 72, cron: '0 0 */3 * *' },
  { label: '7天', value: 168, cron: '0 0 */7 * *' },
  { label: '15天', value: 360, cron: '0 0 */15 * *' },
  { label: '30天', value: 720, cron: '0 0 1 * *' }
];

const newFeed = ref({
  id: undefined as number | undefined,
  name: '',
  url: '',
  parsing_script: defaultScript,
  cron_schedule: '0 0 * * *',
  update_interval: 24,
  proxy_override: '',
  group_id: null
});

onMounted(() => {
  store.fetchFeeds();
});

const openAddModal = () => {
  isEditing.value = false;
  debugResult.value = null;
  newFeed.value = {
    id: undefined,
    name: '',
    url: '',
    parsing_script: defaultScript,
    cron_schedule: '0 0 * * *',
    update_interval: 24,
    proxy_override: '',
    group_id: null
  };
  showAddModal.value = true;
};

const openEditModal = (feed: any) => {
  isEditing.value = true;
  debugResult.value = null;
  // 确保解构以断开响应式连接，并只保留需要的字段
  newFeed.value = {
    id: feed.id,
    name: feed.name,
    url: feed.url,
    parsing_script: feed.parsing_script,
    cron_schedule: feed.cron_schedule,
    update_interval: feed.update_interval || 24,
    proxy_override: feed.proxy_override || '',
    group_id: feed.group_id
  };
  showAddModal.value = true;
};

const handleIntervalChange = (val: number) => {
  const option = intervalOptions.find(o => o.value === val);
  if (option) {
    newFeed.value.cron_schedule = option.cron;
  }
};

const formatIntervalLabel = (val: number) => {
  return intervalOptions.find(o => o.value === val)?.label || val + 'h';
};

const debugScript = async () => {
  if (!newFeed.value.url) return ElMessage.warning('请先输入 RSS URL');
  debugging.value = true;
  debugResult.value = null;
  try {
    const result = await (window as any).electron.ipcRenderer.invoke('debug-rss', {
      url: newFeed.value.url,
      script: newFeed.value.parsing_script
    });
    if (result.success) {
      debugResult.value = result.firstArticle;
      if (!debugResult.value) {
        ElMessage.warning('解析成功，但未找到任何文章。');
      } else {
        ElMessage.success('解析成功，已显示第一篇文章预览。');
      }
    } else {
      ElMessage.error(`调试失败: ${result.error}`);
    }
  } catch (error: any) {
    ElMessage.error(`错误: ${error.message}`);
  } finally {
    debugging.value = false;
  }
};

const generateScript = async () => {
  if (!newFeed.value.url) return ElMessage.warning('请先输入 RSS URL');
  generatingScript.value = true;
  try {
    const rssResult = await (window as any).electron.ipcRenderer.invoke('fetch-raw-rss', newFeed.value.url);
    if (!rssResult.success) {
      throw new Error(`无法获取 RSS 内容: ${rssResult.error}`);
    }

    const rssSnippet = rssResult.data.slice(0, 3000);
    const prompt = `你是一个专业的 RSS 解析专家。请分析以下 RSS 内容的结构，并编写一个 JavaScript 解析函数 'parse(rssText)'。

要求：
1. 我们的沙箱环境已内置 'cheerio' 库，你可以直接使用 'cheerio.load(rssText, { xmlMode: true })' 来解析。
2. 必须返回一个对象数组。
3. 每个对象必须包含以下字段：
   - title: 文章标题
   - authors: 作者姓名数组 (例如 ["Author A", "Author B"])
   - abstract: 摘要或内容简介
   - url: 文章原文链接
   - publication_date: 发布日期字符串
4. 针对学术 RSS（如知网 CNKI、arXiv），请特别注意提取 'author'、'dc:creator' 或 'dc:author' 标签。
5. 针对摘要，请优先提取 'description'、'summary' 或 'content:encoded'。
6. 针对知网格式，作者可能在 <author> 标签中，且带有分号，请注意清洗。
7. 针对 Atom 格式，请注意从 <link rel="alternate" href="..."/> 标签的 href 属性中提取 URL。

代码示例参考：
\`\`\`javascript
function parse(rssText) {
  const $ = cheerio.load(rssText, { xmlMode: true });
  return $('item, entry').map((i, el) => {
    const $el = $(el);
    return {
      title: $el.find('title').text().trim(),
      authors: $el.find('author, dc\\\\:creator').map((i, a) => $(a).text().replace(/;/g, '').trim()).get(),
      abstract: $el.find('description, summary').text().trim(),
      url: $el.find('link').attr('href') || $el.find('link').text().trim(),
      publication_date: $el.find('pubDate, updated').text().trim()
    };
  }).get();
}
\`\`\`

RSS 内容参考：
${rssSnippet}

请只返回代码块，不要有任何解释。`;

    const script = await (window as any).electron.ipcRenderer.invoke('general-ai', { 
      prompt,
      systemRole: "你是一个专业的 RSS 解析脚本生成专家。请只返回 JavaScript 代码块，确保代码在沙箱环境中可用。"
    });
    const codeMatch = script.match(/```javascript([\s\S]*?)```/) || script.match(/```js([\s\S]*?)```/);
    newFeed.value.parsing_script = codeMatch ? codeMatch[1].trim() : script;
    ElMessage.success('脚本已根据 RSS 格式智能生成');
  } catch (error: any) {
    ElMessage.error(`生成失败: ${error.message}`);
  } finally {
    generatingScript.value = false;
  }
};

const saveFeed = async () => {
  if (!newFeed.value.name || !newFeed.value.url) return ElMessage.warning('请填写完整信息');
  adding.value = true;
  try {
    if (isEditing.value) {
      await (window as any).electron.ipcRenderer.invoke('update-feed', toRaw(newFeed.value));
      ElMessage.success('订阅源已更新');
    } else {
      await (window as any).electron.ipcRenderer.invoke('add-feed', toRaw(newFeed.value));
      ElMessage.success('订阅源已成功添加');
    }
    await store.fetchFeeds();
    showAddModal.value = false;
  } catch (error: any) {
    ElMessage.error(`保存失败: ${error.message}`);
  } finally {
    adding.value = false;
  }
};

const updateAllFeeds = async () => {
  try {
    await store.updateAllFeeds();
    ElMessage.success('所有订阅源已更新');
  } catch (error: any) {
    ElMessage.error(`更新失败: ${error.message}`);
  }
};

const updateSingleFeed = async (feedId: number) => {
  try {
    await store.updateSingleFeed(feedId);
    ElMessage.success('订阅源已更新');
  } catch (error: any) {
    ElMessage.error(`更新失败: ${error.message}`);
  }
};

const deleteFeed = async (id: number) => {
  try {
    await ElMessageBox.confirm('确定要永久删除这个订阅源吗？相关的文献记录将删除。', '确认删除', {
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
      type: 'warning',
    });
    await (window as any).electron.ipcRenderer.invoke('delete-feed', id);
    await store.fetchFeeds();
    ElMessage.success('已删除');
  } catch {}
};

const getHostname = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return 'Invalid URL';
  }
};
</script>

<template>
  <div class="p-10 h-full flex flex-col bg-[var(--bg-main)] overflow-hidden">
    <header class="flex justify-between items-center mb-10 shrink-0">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-main)] mb-1">订阅源管理</h1>
        <p class="text-xs text-[var(--text-muted)] font-medium uppercase tracking-widest">Academic RSS Feeds Control Center</p>
      </div>
      <div class="flex gap-3">
        <el-button @click="updateAllFeeds" :loading="store.isUpdatingAll" class="!h-10 !px-5 !rounded-xl !text-sm !font-bold !bg-[var(--bg-card)] !border-[var(--border)] !text-[var(--text-main)]">
          <RefreshCw :size="18" class="mr-2" :class="store.isUpdatingAll ? 'animate-spin' : ''" /> 一键更新
        </el-button>
        <el-button type="primary" @click="openAddModal" class="!h-11 !px-6 !rounded-xl !text-sm !font-bold shadow-lg shadow-[var(--accent)]/20">
          <Plus :size="18" class="mr-2" /> 添加新订阅源
        </el-button>
      </div>
    </header>

    <!-- Progress Bar -->
    <Transition name="fade">
      <div v-if="store.isUpdatingAll" class="mb-8 bg-[var(--bg-card)] p-6 rounded-2xl border border-[var(--border)] shadow-sm">
        <div class="flex justify-between items-center mb-3">
          <span class="text-xs font-bold text-[var(--text-main)] uppercase tracking-widest flex items-center gap-2">
            <RefreshCw :size="14" class="animate-spin text-[var(--accent)]" /> 正在同步订阅源...
          </span>
          <span class="text-xs font-mono font-bold text-[var(--accent)]">{{ store.updateProgress.current }} / {{ store.updateProgress.total }}</span>
        </div>
        <div class="w-full h-2 bg-[var(--bg-main)] rounded-full overflow-hidden border border-[var(--border)]">
          <div 
            class="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-500 ease-out"
            :style="{ width: store.updateProgress.percent + '%' }"
          ></div>
        </div>
      </div>
    </Transition>

    <div class="flex-1 overflow-y-auto pr-4 custom-scrollbar">
      <div v-if="store.feeds.length === 0" class="h-64 flex flex-col items-center justify-center text-[var(--text-muted)] border-2 border-dashed border-[var(--border)] rounded-2xl bg-[var(--bg-card)]/50">
        <Rss :size="48" class="mb-4 opacity-10" />
        <p class="font-bold uppercase tracking-widest text-xs">暂无订阅源</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <div 
          v-for="feed in store.feeds" 
          :key="feed.id"
          class="bg-[var(--bg-card)] p-6 rounded-2xl border border-[var(--border)] hover:border-[var(--accent)]/50 transition-all group relative overflow-hidden shadow-sm"
        >
          <div class="absolute top-0 right-0 p-4 flex items-center gap-2">
            <div 
              class="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-widest"
              :class="feed.last_fetch_status === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'"
            >
              <Activity :size="10" :class="feed.last_fetch_status === 'success' ? 'animate-pulse' : ''" />
              {{ feed.last_fetch_status === 'success' ? 'Active' : 'Failed' }}
            </div>
          </div>

          <div class="flex items-center gap-4 mb-6">
            <div class="w-12 h-12 bg-[var(--bg-main)] rounded-xl flex items-center justify-center text-[var(--accent)] text-lg font-bold border border-[var(--border)]">
              {{ feed.name.charAt(0).toUpperCase() }}
            </div>
            <div class="min-w-0">
              <h3 class="font-bold text-base text-[var(--text-main)] truncate pr-10">{{ feed.name }}</h3>
              <p class="text-[10px] text-[var(--text-muted)] flex items-center gap-1 mt-1 font-medium">
                <Globe :size="12" /> {{ getHostname(feed.url) }}
              </p>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="bg-[var(--bg-main)]/50 p-3 rounded-xl border border-[var(--border)]">
              <p class="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-0.5">本地数据</p>
              <p class="text-xs font-bold text-[var(--text-main)] flex items-center gap-1.5">
                <BookOpen :size="12" class="text-[var(--accent)]" /> {{ feed.article_count || 0 }} 条
              </p>
            </div>
            <div class="bg-[var(--bg-main)]/50 p-3 rounded-xl border border-[var(--border)]">
              <p class="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-0.5">更新间隔</p>
              <p class="text-xs font-bold text-[var(--text-main)] flex items-center gap-1.5">
                <Clock :size="12" class="text-[var(--accent)]" /> {{ formatIntervalLabel(feed.update_interval || 24) }}
              </p>
            </div>
          </div>

          <div class="mt-6 pt-6 border-t border-[var(--border)] flex gap-3 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0">
            <el-button @click="openEditModal(feed)" class="flex-1 !h-9 !bg-[var(--bg-main)] !border-none !text-[var(--text-main)] !text-xs !font-bold">
              <Settings :size="14" class="mr-2" /> 配置
            </el-button>
            <el-button 
              @click.stop="updateSingleFeed(feed.id)"
              class="!w-9 !h-9 !bg-[var(--bg-main)] !text-[var(--text-main)] !border-none hover:!text-[var(--accent)] !p-0"
            >
              <RefreshCw :size="14" :class="store.updatingFeedIds.includes(feed.id) ? 'animate-spin' : ''" />
            </el-button>
            <el-button @click="deleteFeed(feed.id)" class="!w-9 !h-9 !bg-red-500/10 !text-red-500 !border-none hover:!bg-red-500 hover:!text-white !p-0">
              <Trash2 :size="14" />
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- Add/Edit Feed Modal -->
    <el-dialog v-model="showAddModal" :title="isEditing ? '编辑订阅源' : '配置新订阅源'" width="800px" class="custom-dialog">
      <div class="space-y-6 p-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="space-y-2">
            <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest ml-1">订阅源名称</label>
            <el-input v-model="newFeed.name" placeholder="例如: arXiv CS.CV" />
          </div>
          <div class="space-y-2">
            <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest ml-1">RSS 终端地址</label>
            <el-input v-model="newFeed.url" placeholder="https://rss.arxiv.org/rss/cs.cv" />
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="space-y-2">
            <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest ml-1">所属分组</label>
            <el-select v-model="newFeed.group_id" placeholder="选择分组" class="w-full" clearable>
              <el-option label="未分类" :value="null" />
              <el-option v-for="group in store.groups" :key="group.id" :label="group.name" :value="group.id" />
            </el-select>
          </div>
          <div class="space-y-2">
            <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest ml-1">自定义代理 (可选)</label>
            <el-input v-model="newFeed.proxy_override" placeholder="http://127.0.0.1:7890" />
          </div>
        </div>

        <div class="space-y-4 bg-[var(--bg-main)]/30 p-4 rounded-xl border border-[var(--border)]">
          <div class="flex justify-between items-center">
            <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest ml-1">更新频率</label>
            <span class="text-[9px] font-mono text-[var(--text-muted)]">CRON: {{ newFeed.cron_schedule }}</span>
          </div>
          <IntervalSlider 
            v-model="newFeed.update_interval" 
            @change="handleIntervalChange"
          />
        </div>

        <div class="space-y-3">
          <div class="flex justify-between items-center px-1">
            <div class="flex items-center gap-2">
              <Terminal :size="14" class="text-[var(--accent)]" />
              <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">解析逻辑 (JavaScript)</label>
            </div>
            <el-button 
              type="primary" 
              @click="generateScript" 
              :loading="generatingScript"
              class="!h-10 !px-6 !rounded-lg !text-xs !font-bold !bg-[var(--accent)]/10 !text-[var(--accent)] hover:!bg-[var(--accent)] hover:!text-white !border-none uppercase tracking-widest"
            >
              <Wand2 :size="14" class="mr-2" /> AI 自动生成脚本
            </el-button>
          </div>
          
          <el-input 
            v-model="newFeed.parsing_script" 
            type="textarea" 
            :rows="10" 
            class="font-mono text-xs"
            spellcheck="false"
          />
        </div>

        <!-- Debug Result Preview -->
        <div v-if="debugResult" class="bg-[var(--bg-main)] border border-[var(--border)] rounded-xl p-5 space-y-3 animate-in fade-in slide-in-from-top-2">
          <div class="flex items-center justify-between mb-2">
            <h4 class="text-[10px] font-bold text-[var(--accent)] uppercase tracking-widest flex items-center gap-2">
              <Play :size="12" /> 抓取预览 (第一篇文章)
            </h4>
            <button @click="debugResult = null" class="text-[var(--text-muted)] hover:text-[var(--text-main)]">
              <Plus :size="14" class="rotate-45" />
            </button>
          </div>
          <div class="space-y-2">
            <p class="text-sm font-bold text-[var(--text-main)]">{{ debugResult.title }}</p>
            <p class="text-[10px] text-[var(--text-muted)] font-medium">作者: {{ Array.isArray(debugResult.authors) ? debugResult.authors.join(', ') : debugResult.authors }}</p>
            <p class="text-[10px] text-[var(--text-muted)] line-clamp-2 italic">{{ debugResult.abstract }}</p>
            <div class="flex items-center gap-4 text-[9px] font-bold text-[var(--accent)] uppercase">
              <span>日期: {{ debugResult.publication_date }}</span>
              <span class="truncate flex-1">链接: {{ debugResult.url }}</span>
            </div>
          </div>
        </div>

        <div class="bg-[var(--accent)]/5 border border-[var(--accent)]/10 p-5 rounded-xl flex items-start gap-4">
          <AlertCircle :size="18" class="text-[var(--accent)] shrink-0 mt-0.5" />
          <p class="text-xs text-[var(--text-muted)] leading-relaxed font-medium">
            您的解析脚本将在隔离的沙箱中运行。请确保脚本返回包含 title, authors, abstract, url 和 publication_date 的对象数组。
          </p>
        </div>
      </div>

      <template #footer>
        <div class="flex gap-4 p-6 border-t border-[var(--border)]">
          <el-button 
            @click="debugScript" 
            :loading="debugging"
            class="flex-1 !h-11 !rounded-xl !bg-transparent !border-[var(--border)] !text-[var(--accent)]"
          >
            <Play :size="18" class="mr-2" /> 调试解析
          </el-button>
          <el-button type="primary" @click="saveFeed" :loading="adding" class="flex-[2] !h-11 !rounded-xl !font-bold shadow-lg shadow-[var(--accent)]/20">
            <CheckCircle2 :size="18" class="mr-2" /> {{ isEditing ? '保存修改' : '完成并保存订阅' }}
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.el-textarea :deep(.el-textarea__inner) {
  @apply !border-[var(--border)] !rounded-xl !p-4 !text-[var(--accent)] !font-mono !leading-relaxed !important;
  background-color: rgba(0, 0, 0, 0.05) !important;
}

.dark .el-textarea :deep(.el-textarea__inner) {
  background-color: rgba(0, 0, 0, 0.3) !important;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  @apply bg-[var(--border)] rounded-full;
}
</style>
