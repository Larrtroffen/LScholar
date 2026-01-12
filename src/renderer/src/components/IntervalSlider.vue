<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';

const props = defineProps<{
  modelValue: number;
}>();

const emit = defineEmits(['update:modelValue', 'change']);

const options = [
  { label: '12h', value: 12 },
  { label: '24h', value: 24 },
  { label: '2d', value: 48 },
  { label: '3d', value: 72 },
  { label: '7d', value: 168 },
  { label: '15d', value: 360 },
  { label: '30d', value: 720 }
];

const currentIndex = computed(() => {
  // 寻找最接近的值的索引，确保即使传入的值不完全匹配也能正确显示
  let closestIndex = 0;
  let minDiff = Math.abs(options[0].value - props.modelValue);
  
  for (let i = 1; i < options.length; i++) {
    const diff = Math.abs(options[i].value - props.modelValue);
    if (diff < minDiff) {
      minDiff = diff;
      closestIndex = i;
    }
  }
  return closestIndex;
});

const sliderRef = ref<HTMLElement | null>(null);
const isDragging = ref(false);

const handleMouseDown = (e: MouseEvent) => {
  isDragging.value = true;
  updateValue(e.clientX);
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);
};

const handleMouseMove = (e: MouseEvent) => {
  if (!isDragging.value) return;
  updateValue(e.clientX);
};

const handleMouseUp = () => {
  isDragging.value = false;
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('mouseup', handleMouseUp);
};

const updateValue = (clientX: number) => {
  if (!sliderRef.value) return;
  const rect = sliderRef.value.getBoundingClientRect();
  const x = clientX - rect.left;
  const width = rect.width;
  
  // 确保百分比在 0-1 之间
  let percentage = x / width;
  percentage = Math.max(0, Math.min(1, percentage));
  
  // 计算最接近的索引
  const index = Math.round(percentage * (options.length - 1));
  
  if (index !== currentIndex.value && index >= 0 && index < options.length) {
    emit('update:modelValue', options[index].value);
    emit('change', options[index].value);
  }
};

const selectIndex = (index: number) => {
  emit('update:modelValue', options[index].value);
  emit('change', options[index].value);
};
</script>

<template>
  <div class="interval-slider-container py-8 px-2">
    <div 
      ref="sliderRef"
      class="relative h-1.5 bg-[var(--bg-main)] rounded-full cursor-pointer group"
      @mousedown="handleMouseDown"
    >
      <!-- Track Fill -->
      <div 
        class="absolute top-0 left-0 h-full bg-gradient-to-r from-[var(--accent)] to-blue-400 rounded-full"
        :class="{ 'transition-all duration-300 ease-out': !isDragging }"
        :style="{ width: (currentIndex / (options.length - 1)) * 100 + '%' }"
      ></div>

      <!-- Marks & Labels -->
      <div class="absolute inset-0 flex justify-between items-center">
        <div 
          v-for="(opt, index) in options" 
          :key="opt.value"
          class="relative flex flex-col items-center"
          @click.stop="selectIndex(index)"
        >
          <!-- Tick Dot -->
          <div 
            class="w-1.5 h-1.5 rounded-full transition-all duration-300"
            :class="index <= currentIndex ? 'bg-white/50 scale-75' : 'bg-[var(--border)]'"
          ></div>
          
          <!-- Label -->
          <div 
            class="absolute top-4 text-[10px] font-bold transition-all duration-300 whitespace-nowrap"
            :class="index === currentIndex ? 'text-[var(--accent)] scale-110' : 'text-[var(--text-muted)] opacity-50'"
          >
            {{ opt.label }}
          </div>
        </div>
      </div>

      <!-- Handle -->
      <div 
        class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 bg-white rounded-full shadow-lg border-2 border-[var(--accent)] cursor-grab active:cursor-grabbing z-10 flex items-center justify-center"
        :class="{ 'transition-all duration-300 ease-out': !isDragging }"
        :style="{ left: (currentIndex / (options.length - 1)) * 100 + '%' }"
      >
        <div class="w-1.5 h-1.5 bg-[var(--accent)] rounded-full animate-pulse"></div>
        
        <!-- Tooltip -->
        <div class="absolute -top-10 bg-[var(--accent)] text-white text-[10px] px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none font-bold">
          {{ options[currentIndex].label }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.interval-slider-container {
  user-select: none;
}
</style>
