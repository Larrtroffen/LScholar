<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { ChevronDown, Check } from 'lucide-vue-next';

interface Option {
  label: string;
  value: any;
  icon?: string;
  description?: string;
}

const props = defineProps<{
  modelValue: any;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
}>();

const emit = defineEmits(['update:modelValue', 'change']);

const isOpen = ref(false);
const selectRef = ref<HTMLElement | null>(null);

const selectedOption = computed(() => {
  return props.options.find(opt => opt.value === props.modelValue);
});

const toggleDropdown = () => {
  if (props.disabled) return;
  isOpen.value = !isOpen.value;
};

const selectOption = (option: Option) => {
  console.log('[CustomSelect] selectOption called with:', option);
  console.log('[CustomSelect] Emitting update:modelValue with:', option.value);
  // 使用 nextTick 确保 DOM 更新后再关闭下拉菜单
  emit('update:modelValue', option.value);
  emit('change', option.value);
  console.log('[CustomSelect] Events emitted, closing dropdown...');
  setTimeout(() => {
    isOpen.value = false;
    console.log('[CustomSelect] Dropdown closed');
  }, 0);
};

const handleClickOutside = (event: MouseEvent) => {
  if (selectRef.value && !selectRef.value.contains(event.target as Node)) {
    isOpen.value = false;
  }
};

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<template>
  <div class="relative custom-select" ref="selectRef">
    <!-- Trigger -->
    <div
      @click="toggleDropdown"
      class="flex items-center justify-between px-4 py-2.5 rounded-xl border transition-all duration-200 cursor-pointer select-none"
      :class="[
        isOpen ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/10 bg-[var(--bg-card)]' : 'border-[var(--border)] bg-[var(--bg-main)]/50 hover:border-[var(--accent)]/50',
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      ]"
    >
      <div class="flex items-center gap-2 overflow-hidden">
        <span v-if="selectedOption?.icon" class="text-lg">{{ selectedOption.icon }}</span>
        <span v-if="selectedOption" class="text-sm font-medium text-[var(--text-main)] truncate">
          {{ selectedOption.label }}
        </span>
        <span v-else class="text-sm text-[var(--text-muted)] truncate">
          {{ placeholder || '请选择' }}
        </span>
      </div>
      <ChevronDown
        :size="16"
        class="text-[var(--text-muted)] transition-transform duration-200"
        :class="{ 'rotate-180': isOpen }"
      />
    </div>

    <!-- Dropdown -->
    <Transition
      enter-active-class="transition duration-100 ease-out"
      enter-from-class="transform scale-95 opacity-0"
      enter-to-class="transform scale-100 opacity-100"
      leave-active-class="transition duration-75 ease-in"
      leave-from-class="transform scale-100 opacity-100"
      leave-to-class="transform scale-95 opacity-0"
    >
      <div
        v-if="isOpen"
        class="absolute z-50 w-full mt-2 py-1.5 overflow-auto bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-xl max-h-60 custom-scrollbar"
      >
        <div
          v-for="option in options"
          :key="option.value"
          @click="selectOption(option)"
          class="flex items-center justify-between px-4 py-2 mx-1.5 rounded-lg cursor-pointer transition-colors group"
          :class="[
            modelValue === option.value ? 'bg-[var(--accent)]/10 text-[var(--accent)]' : 'text-[var(--text-main)] hover:bg-[var(--bg-main)]'
          ]"
        >
          <div class="flex flex-col overflow-hidden">
            <div class="flex items-center gap-2">
              <span v-if="option.icon" class="text-base">{{ option.icon }}</span>
              <span class="text-sm font-medium truncate">{{ option.label }}</span>
            </div>
            <span v-if="option.description" class="text-[10px] text-[var(--text-muted)] truncate mt-0.5">
              {{ option.description }}
            </span>
          </div>
          <Check v-if="modelValue === option.value" :size="14" class="flex-shrink-0" />
        </div>
        <div v-if="options.length === 0" class="px-4 py-8 text-center">
          <span class="text-xs text-[var(--text-muted)]">暂无选项</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.custom-select {
  min-width: 120px;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 10px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}
</style>