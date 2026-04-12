<script setup lang="ts">
import { computed, onMounted, watch, ref } from 'vue';
import { ArrowLeft, RefreshCw, Search } from 'lucide-vue-next';
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

// Sync input when currentPath changes externally
watch(currentPath, (newPath) => {
  inputPath.value = newPath;
  error.value = null;
}, { immediate: true });

onMounted(async () => {
  if (props.connected) {
    error.value = null;
    await zkTreeStore.navigateTo(props.connectionUuid, '/');
    inputPath.value = '/';
  }
});

watch(() => props.connected, async (connected) => {
  if (connected) {
    error.value = null;
    await zkTreeStore.navigateTo(props.connectionUuid, '/');
    inputPath.value = '/';
  } else {
    zkTreeStore.clearConnection(props.connectionUuid);
    inputPath.value = '/';
    error.value = null;
  }
});

const handleInput = (e: Event) => {
  const target = e.target as HTMLInputElement;
  inputPath.value = target.value;
  error.value = null;
};

const handleNavigate = async () => {
  if (!inputPath.value.trim()) return;

  // If same path, no navigation needed
  if (inputPath.value === currentPath.value) {
    return;
  }

  error.value = null;
  try {
    await zkTreeStore.navigateTo(props.connectionUuid, inputPath.value);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
    // Restore input to current path
    inputPath.value = currentPath.value;
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
};

const refresh = () => {
  error.value = null;
  zkTreeStore.refreshCurrentPath(props.connectionUuid);
};

const clearError = () => {
  error.value = null;
  inputPath.value = currentPath.value;
};
</script>

<template>
  <div class="zk-list">
    <!-- Single Row: Path Input + Controls -->
    <div class="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b border-border/30">
      <!-- Back Button -->
      <button
        class="w-8 h-8 flex items-center justify-center rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground shrink-0 border border-border"
        title="Go to parent"
        @click="navigateUp"
      >
        <ArrowLeft class="w-4 h-4" />
      </button>

      <!-- Path Input -->
      <div class="relative flex-1 min-w-0">
        <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          :value="inputPath"
          class="w-full h-8 pl-8 pr-3 text-sm rounded-md border border-border bg-background transition-colors outline-none focus:border-primary"
          :class="error ? 'border-destructive' : ''"
          placeholder="/path/to/node"
          @input="handleInput"
          @keydown="handleKeydown"
          @blur="handleNavigate"
        >
      </div>

      <!-- Refresh Button -->
      <button
        class="w-8 h-8 flex items-center justify-center rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground shrink-0 border border-border"
        title="Refresh"
        @click="refresh"
      >
        <RefreshCw class="w-4 h-4" />
      </button>
    </div>

    <!-- Error State -->
    <div
      v-if="error"
      class="px-2 py-1.5 bg-destructive/10 text-xs text-destructive flex items-center justify-between"
    >
      <span class="truncate">{{ error }}</span>
      <button
        class="shrink-0 hover:text-foreground ml-2"
        @click="clearError"
      >
        ✕
      </button>
    </div>

    <!-- Loading State -->
    <div
      v-else-if="loading"
      class="flex items-center justify-center py-6 text-muted-foreground text-xs"
    >
      <RefreshCw class="w-3 h-3 animate-spin mr-2" />
      <span>Loading...</span>
    </div>

    <!-- Empty State -->
    <div
      v-else-if="children.length === 0"
      class="flex items-center justify-center py-6 text-muted-foreground text-xs"
    >
      No children
    </div>

    <!-- Node List -->
    <div
      v-else
      class="py-1"
    >
      <ListNode
        v-for="node in children"
        :key="node.path"
        :node="node"
        :connection-uuid="connectionUuid"
      />
    </div>
  </div>
</template>
