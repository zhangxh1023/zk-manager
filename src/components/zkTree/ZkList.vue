<script setup lang="ts">
import { computed, onMounted, watch, ref } from 'vue';
import { useZkTreeStore } from '../../stores/zkTree';
import ListNode from './ListNode.vue';

const props = defineProps<{
  connectionUuid: string;
  connected: boolean;
}>();

const zkTreeStore = useZkTreeStore();

const currentPath = computed(() => zkTreeStore.getCurrentPath(props.connectionUuid));
const children = computed(() => zkTreeStore.getChildren(props.connectionUuid, currentPath.value));
const loading = computed(() => zkTreeStore.isLoading(props.connectionUuid, currentPath.value));
const error = ref<string | null>(null);

// Local input state
const inputPath = ref('/');
const isDirty = ref(false);

// Sync input when currentPath changes externally
watch(currentPath, (newPath) => {
  if (!isDirty.value) {
    inputPath.value = newPath;
    error.value = null; // Clear error on successful navigation
  }
}, { immediate: true });

onMounted(async () => {
  if (props.connected) {
    error.value = null;
    await zkTreeStore.navigateTo(props.connectionUuid, '/');
    inputPath.value = '/';
    isDirty.value = false;
  }
});

watch(() => props.connected, async (connected) => {
  if (connected) {
    error.value = null;
    await zkTreeStore.navigateTo(props.connectionUuid, '/');
    inputPath.value = '/';
    isDirty.value = false;
  } else {
    zkTreeStore.clearConnection(props.connectionUuid);
    inputPath.value = '/';
    isDirty.value = false;
    error.value = null;
  }
});

const handleInput = (e: Event) => {
  const target = e.target as HTMLInputElement;
  inputPath.value = target.value;
  isDirty.value = target.value !== currentPath.value;
  error.value = null;
};

const handleNavigate = async () => {
  if (!inputPath.value.trim()) return;

  // If input equals current path and there's an error, just clear error (user clicked dismiss)
  if (inputPath.value === currentPath.value && error.value) {
    error.value = null;
    isDirty.value = false;
    return;
  }

  // If same path, no navigation needed
  if (inputPath.value === currentPath.value) {
    isDirty.value = false;
    return;
  }

  error.value = null;
  try {
    await zkTreeStore.navigateTo(props.connectionUuid, inputPath.value);
    // If we reach here, navigation was successful
    isDirty.value = false;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
    // Restore input to current path
    inputPath.value = currentPath.value;
    isDirty.value = false;
  }
};

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    handleNavigate();
  }
};

const navigateUp = async () => {
  error.value = null;
  await zkTreeStore.navigateUp(props.connectionUuid);
  inputPath.value = zkTreeStore.getCurrentPath(props.connectionUuid);
  isDirty.value = false;
};

const refresh = () => {
  error.value = null;
  zkTreeStore.refreshCurrentPath(props.connectionUuid);
};

const clearError = () => {
  error.value = null;
  inputPath.value = currentPath.value;
  isDirty.value = false;
};
</script>

<template>
  <div class="zk-list">
    <!-- Single Row: Path Input + Controls -->
    <div class="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b border-border/50">
      <!-- Back Button -->
      <button
        class="w-8 h-8 flex items-center justify-center rounded-lg bg-background border border-border hover:bg-accent hover:border-accent transition-colors text-sm shrink-0"
        @click="navigateUp"
        title="Go to parent"
      >
        ←
      </button>

      <!-- Path Input -->
      <div class="relative flex-1 min-w-0">
        <input
          type="text"
          :value="inputPath"
          @input="handleInput"
          @keydown="handleKeydown"
          @blur="handleNavigate"
          class="w-full h-8 px-3 pr-8 text-sm rounded-lg border bg-background transition-colors outline-none"
          :class="isDirty
            ? 'border-primary ring-1 ring-primary/30'
            : error
              ? 'border-destructive ring-1 ring-destructive/30'
              : 'border-border hover:border-accent'"
          placeholder="/path/to/node"
        />
        <!-- Dirty indicator dot -->
        <span
          v-if="isDirty"
          class="absolute right-2 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary"
          title="Path modified"
        />
      </div>

      <!-- Refresh Button -->
      <button
        class="w-8 h-8 flex items-center justify-center rounded-lg bg-background border border-border hover:bg-accent hover:border-accent transition-colors text-sm shrink-0"
        @click="refresh"
        title="Refresh"
      >
        ↻
      </button>
    </div>

    <!-- Error State -->
    <div v-if="error" class="px-3 py-2 bg-destructive/10 border-b border-destructive/20">
      <div class="flex items-center justify-between">
        <span class="text-xs text-destructive">{{ error }}</span>
        <button
          class="text-xs text-muted-foreground hover:text-foreground"
          @click="clearError"
        >
          ✕
        </button>
      </div>
    </div>

    <!-- Current Path Display (when dirty) -->
    <div v-else-if="isDirty" class="px-3 py-1.5 bg-muted/20 border-b border-border/30 text-xs text-muted-foreground">
      Current: <button class="text-primary hover:underline" @click="clearError">{{ currentPath }}</button>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center py-8 text-muted-foreground text-xs">
      <span class="animate-pulse">Loading...</span>
    </div>

    <!-- Empty State -->
    <div v-else-if="children.length === 0" class="flex items-center justify-center py-8 text-muted-foreground text-xs">
      No children
    </div>

    <!-- Node List -->
    <div v-else class="py-1">
      <ListNode
        v-for="node in children"
        :key="node.path"
        :node="node"
        :connection-uuid="connectionUuid"
      />
    </div>
  </div>
</template>
