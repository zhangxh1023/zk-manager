<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch, ref } from 'vue';
import { ArrowLeft, ArrowRight, Plus, RefreshCw, Search } from 'lucide-vue-next';
import { useZkTreeStore } from '../../stores/zkTree';
import { useLogsStore } from '../../stores/logs';
import ListNode from './ListNode.vue';
import { getErrorMessage } from '../../utils/errors';
import { zkApi } from '../../api/zk';
import { showToast } from '../../utils/toast';
import { useI18n } from 'vue-i18n';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { filterZkListNodes, normalizeCreateNodePath } from './utils';

const props = defineProps<{
  connectionUuid: string;
  connected: boolean;
}>();

const { t } = useI18n();
const zkTreeStore = useZkTreeStore();
const logsStore = useLogsStore();
const FILTER_DEBOUNCE_MS = 300;

const currentPath = computed(() => zkTreeStore.getCurrentPath(props.connectionUuid));
const children = computed(() => zkTreeStore.getChildren(props.connectionUuid, currentPath.value));
const loading = computed(() => zkTreeStore.isLoading(props.connectionUuid, currentPath.value));
const searchQuery = ref('');
const activeFilterQuery = ref('');
const filteredChildren = computed(() => filterZkListNodes(children.value, activeFilterQuery.value));
const showCreateNodeDialog = ref(false);
const createNodePath = ref('/');
const createNodeData = ref('');
const createMissingParents = ref(false);
const isCreatingNode = ref(false);

// Local input state
const inputPath = ref('/');
let filterDebounceTimer: ReturnType<typeof setTimeout> | null = null;

const clearFilterDebounce = () => {
  if (filterDebounceTimer === null) return;
  clearTimeout(filterDebounceTimer);
  filterDebounceTimer = null;
};

const applyFilter = () => {
  clearFilterDebounce();
  activeFilterQuery.value = searchQuery.value.trim();
};

const scheduleFilter = () => {
  clearFilterDebounce();
  filterDebounceTimer = setTimeout(applyFilter, FILTER_DEBOUNCE_MS);
};

const handleFilterInput = (e: Event) => {
  const target = e.target as HTMLInputElement;
  searchQuery.value = target.value;
  scheduleFilter();
};

const clearFilter = () => {
  clearFilterDebounce();
  searchQuery.value = '';
  activeFilterQuery.value = '';
};

// Sync input when currentPath changes externally
watch(currentPath, (newPath) => {
  inputPath.value = newPath;
}, { immediate: true });

onMounted(async () => {
  if (props.connected) {
    await zkTreeStore.navigateTo(props.connectionUuid, '/');
    inputPath.value = '/';
  }
});

watch(() => props.connected, async (connected) => {
  if (connected) {
    await zkTreeStore.navigateTo(props.connectionUuid, '/');
    inputPath.value = '/';
  } else {
    zkTreeStore.clearConnection(props.connectionUuid);
    inputPath.value = '/';
    clearFilter();
    showCreateNodeDialog.value = false;
  }
});

onBeforeUnmount(clearFilterDebounce);

const handleInput = (e: Event) => {
  const target = e.target as HTMLInputElement;
  inputPath.value = target.value;
};

const handleNavigate = async () => {
  if (!inputPath.value.trim()) return;

  // If same path, no navigation needed
  if (inputPath.value === currentPath.value) {
    return;
  }

  try {
    await zkTreeStore.navigateTo(props.connectionUuid, inputPath.value);
  } catch (err) {
    showToast.error(getErrorMessage(err));
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
  try {
    await zkTreeStore.navigateUp(props.connectionUuid);
    inputPath.value = zkTreeStore.getCurrentPath(props.connectionUuid);
  } catch (err) {
    showToast.error(getErrorMessage(err));
    inputPath.value = currentPath.value;
  }
};

const refresh = () => {
  zkTreeStore.refreshCurrentPath(props.connectionUuid).catch((err) => {
    showToast.error(getErrorMessage(err));
  });
};

const defaultCreatePath = () => currentPath.value === '/' ? '/' : `${currentPath.value}/`;

const openCreateNodeDialog = () => {
  createNodePath.value = defaultCreatePath();
  createNodeData.value = '';
  createMissingParents.value = false;
  showCreateNodeDialog.value = true;
};

const createNodeByFullPath = async () => {
  const normalizedPath = normalizeCreateNodePath(createNodePath.value);
  if (!normalizedPath) {
    showToast.error(t('createNode.invalidFullPath'));
    return;
  }

  isCreatingNode.value = true;
  try {
    const data = Array.from(new TextEncoder().encode(createNodeData.value));
    if (createMissingParents.value) {
      await zkApi.createNodeRecursive(props.connectionUuid, normalizedPath, data);
    } else {
      await zkApi.createNode(props.connectionUuid, normalizedPath, data);
    }

    const logMessage = createMissingParents.value
      ? `Recursively created node ${normalizedPath}`
      : `Created node ${normalizedPath}`;
    await logsStore.addLog(props.connectionUuid, 'CREATE', logMessage);
    await zkTreeStore.onNodeCreatedAtPath(props.connectionUuid, normalizedPath, {
      invalidateAncestors: true,
      refreshCurrentPath: true,
    }).catch((refreshError) => {
      showToast.error(getErrorMessage(refreshError));
    });
    showCreateNodeDialog.value = false;
    showToast.success(t('node.createSuccess', { path: normalizedPath }));
  } catch (err) {
    const message = getErrorMessage(err);
    await logsStore.addLog(
      props.connectionUuid,
      'CREATE',
      `Failed to create node ${normalizedPath}: ${message}`,
      false,
    );
    showToast.error(`${t('node.createFailed')}: ${message}`);
  } finally {
    isCreatingNode.value = false;
  }
};
</script>

<template>
  <div class="zk-list">
    <!-- Path Navigation Row -->
    <div
      data-testid="zk-path-toolbar"
      class="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b border-border/30"
    >
      <!-- Back Button -->
      <button
        type="button"
        aria-label="Go to parent"
        class="w-8 h-8 flex items-center justify-center rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground shrink-0 border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          class="w-full h-8 pl-8 pr-10 text-sm rounded-md border border-border bg-background transition-colors outline-none focus:border-primary"
          placeholder="/path/to/node"
          @input="handleInput"
          @keydown.enter.prevent="handleKeydown"
        >
        <!-- Go Button -->
        <button
          type="button"
          aria-label="Go to path"
          class="absolute right-0 top-0 w-8 h-8 flex items-center justify-center rounded-r-md border-l border-border/70 hover:bg-accent transition-colors text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          title="Go to path"
          @click="handleNavigate"
        >
          <ArrowRight class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- List Filter and Actions Row -->
    <div
      data-testid="zk-list-toolbar"
      class="list-toolbar flex items-center gap-2 px-3 py-2 border-b border-border/30"
    >
      <div class="list-filter relative flex-1 min-w-0">
        <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          :value="searchQuery"
          type="text"
          data-testid="znode-list-filter"
          class="w-full h-8 pl-8 pr-3 text-sm rounded-md border border-border bg-background transition-colors outline-none focus:border-primary"
          :placeholder="t('search.placeholder')"
          :aria-label="t('search.placeholder')"
          @input="handleFilterInput"
          @keydown.enter.prevent="applyFilter"
        >
      </div>

      <div
        class="list-toolbar-separator h-5 w-px bg-border/70 shrink-0"
        aria-hidden="true"
      />

      <div class="list-actions flex items-center gap-1 shrink-0">
        <!-- Refresh Button -->
        <button
          type="button"
          aria-label="Refresh"
          class="w-8 h-8 flex items-center justify-center rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title="Refresh"
          @click="refresh"
        >
          <RefreshCw class="w-4 h-4" />
        </button>

        <!-- Create Node Button -->
        <button
          type="button"
          :aria-label="t('createNode.fullPathTitle')"
          :disabled="!connected || isCreatingNode"
          class="w-8 h-8 flex items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 disabled:cursor-not-allowed"
          :title="t('createNode.fullPathTitle')"
          @click="openCreateNodeDialog"
        >
          <Plus class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div
      v-if="loading"
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

    <!-- Filtered Empty State -->
    <div
      v-else-if="filteredChildren.length === 0"
      class="flex items-center justify-center py-6 text-muted-foreground text-xs"
    >
      {{ t('search.noResults') }}
    </div>

    <!-- Node List -->
    <div
      v-else
      class="py-1"
    >
      <ListNode
        v-for="node in filteredChildren"
        :key="node.path"
        :node="node"
        :connection-uuid="connectionUuid"
      />
    </div>

    <Dialog v-model:open="showCreateNodeDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ t('createNode.fullPathTitle') }}</DialogTitle>
        </DialogHeader>
        <div class="space-y-4 py-4">
          <div>
            <Label
              for="fullNodePath"
              class="text-xs uppercase tracking-wider font-semibold text-muted-foreground"
            >
              {{ t('createNode.nodeFullPath') }}
            </Label>
            <Input
              id="fullNodePath"
              v-model="createNodePath"
              :placeholder="t('createNode.placeholder.fullPath')"
              :disabled="isCreatingNode"
              @keydown.enter.prevent="createNodeByFullPath"
            />
          </div>
          <div>
            <Label
              for="fullNodeData"
              class="text-xs uppercase tracking-wider font-semibold text-muted-foreground"
            >
              {{ t('createNode.nodeData') }}
            </Label>
            <Textarea
              id="fullNodeData"
              v-model="createNodeData"
              :placeholder="t('createNode.placeholder.data')"
              :disabled="isCreatingNode"
              class="font-mono text-xs"
            />
          </div>
          <label class="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              v-model="createMissingParents"
              type="checkbox"
              class="size-4 rounded border-input"
              :disabled="isCreatingNode"
            >
            <span>{{ t('createNode.createMissingParents') }}</span>
          </label>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            :disabled="isCreatingNode"
            @click="showCreateNodeDialog = false"
          >
            {{ t('connection.cancel') }}
          </Button>
          <Button
            :disabled="isCreatingNode"
            @click="createNodeByFullPath"
          >
            {{ t('connection.save') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
