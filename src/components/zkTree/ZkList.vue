<script setup lang="ts">
import { computed, onMounted, watch, ref } from 'vue';
import { ArrowLeft, ArrowRight, Plus, RefreshCw, Search, X } from 'lucide-vue-next';
import { useZkTreeStore } from '../../stores/zkTree';
import { useZnodeTabsStore } from '../../stores/znodeTabs';
import { useLogsStore } from '../../stores/logs';
import ListNode from './ListNode.vue';
import { getErrorMessage } from '../../utils/errors';
import { zkApi, type ZnodeSearchResult } from '../../api/zk';
import { showToast } from '../../utils/toast';
import { useI18n } from 'vue-i18n';
import { confirmDialog } from '../../composables/useConfirmDialog';
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
import { normalizeCreateNodePath } from './utils';

const props = defineProps<{
  connectionUuid: string;
  connected: boolean;
}>();

const { t } = useI18n();
const zkTreeStore = useZkTreeStore();
const znodeTabsStore = useZnodeTabsStore();
const logsStore = useLogsStore();

const currentPath = computed(() => zkTreeStore.getCurrentPath(props.connectionUuid));
const children = computed(() => zkTreeStore.getChildren(props.connectionUuid, currentPath.value));
const loading = computed(() => zkTreeStore.isLoading(props.connectionUuid, currentPath.value));
const error = ref<string | null>(null);
const searchQuery = ref('');
const searchResults = ref<ZnodeSearchResult[]>([]);
const searchLoading = ref(false);
const searchError = ref<string | null>(null);
const hasSearched = ref(false);
const hasSearchState = computed(() =>
  searchQuery.value.trim().length > 0 || searchResults.value.length > 0 || searchError.value !== null,
);
const showCreateNodeDialog = ref(false);
const createNodePath = ref('/');
const createNodeData = ref('');
const createMissingParents = ref(false);
const createNodeError = ref('');
const isCreatingNode = ref(false);

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
    clearSearch();
    showCreateNodeDialog.value = false;
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
    error.value = getErrorMessage(err);
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

const defaultCreatePath = () => currentPath.value === '/' ? '/' : `${currentPath.value}/`;

const openCreateNodeDialog = () => {
  createNodePath.value = defaultCreatePath();
  createNodeData.value = '';
  createMissingParents.value = false;
  createNodeError.value = '';
  showCreateNodeDialog.value = true;
};

const createNodeByFullPath = async () => {
  const normalizedPath = normalizeCreateNodePath(createNodePath.value);
  if (!normalizedPath) {
    createNodeError.value = t('createNode.invalidFullPath');
    return;
  }

  isCreatingNode.value = true;
  createNodeError.value = '';
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
    createNodeError.value = message;
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

const parentPathOf = (path: string) => {
  if (path === '/') return '/';
  return path.substring(0, path.lastIndexOf('/')) || '/';
};

const runSearch = async () => {
  const query = searchQuery.value.trim();
  if (!query) {
    searchResults.value = [];
    searchError.value = null;
    return;
  }

  searchLoading.value = true;
  searchError.value = null;
  try {
    searchResults.value = await zkApi.searchNodes(props.connectionUuid, currentPath.value, query, 50);
    hasSearched.value = true;
    await logsStore.addLog(
      props.connectionUuid,
      'SEARCH',
      `Searched ${currentPath.value} for "${query}", results: ${searchResults.value.length}`,
    );
  } catch (err) {
    const message = getErrorMessage(err);
    searchError.value = message;
    showToast.error(message);
  } finally {
    searchLoading.value = false;
  }
};

const openNodePath = async (path: string) => {
  try {
    const dirtyTemporaryTab = znodeTabsStore.getDirtyTemporaryTabForReplacement(
      props.connectionUuid,
      path,
    );
    if (dirtyTemporaryTab && !(await confirmDialog(t('tabs.confirmReplaceDirty')))) {
      return;
    }

    const details = await zkApi.getDetails(props.connectionUuid, path);
    znodeTabsStore.replaceOrCreateTemporaryTab({
      connectionUuid: props.connectionUuid,
      path,
      znodeData: details.data,
      stat: details.stat,
      acl: details.acl,
      isActive: true,
      isTemporary: true,
    });
    await zkTreeStore.navigateTo(props.connectionUuid, parentPathOf(path));
    await logsStore.addLog(props.connectionUuid, 'NAVIGATE', `Opened node ${path}`);
  } catch (err) {
    const message = getErrorMessage(err);
    showToast.error(message);
  }
};

const openSearchResult = async (result: ZnodeSearchResult) => {
  await openNodePath(result.path);
};

function clearSearch() {
  searchQuery.value = '';
  searchResults.value = [];
  searchError.value = null;
  hasSearched.value = false;
}

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
        aria-label="Go to parent"
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
          @keydown.enter.prevent="handleKeydown"
        >
      </div>

      <!-- Go Button -->
      <button
        aria-label="Go to path"
        class="w-8 h-8 flex items-center justify-center rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground shrink-0 border border-border"
        title="Go to path"
        @click="handleNavigate"
      >
        <ArrowRight class="w-4 h-4" />
      </button>

      <!-- Refresh Button -->
      <button
        aria-label="Refresh"
        class="w-8 h-8 flex items-center justify-center rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground shrink-0 border border-border"
        title="Refresh"
        @click="refresh"
      >
        <RefreshCw class="w-4 h-4" />
      </button>

      <!-- Create Node Button -->
      <button
        :aria-label="t('createNode.fullPathTitle')"
        :disabled="!connected || isCreatingNode"
        class="w-8 h-8 flex items-center justify-center rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground shrink-0 border border-border disabled:opacity-40 disabled:cursor-not-allowed"
        :title="t('createNode.fullPathTitle')"
        @click="openCreateNodeDialog"
      >
        <Plus class="w-4 h-4" />
      </button>
    </div>

    <!-- Search Row -->
    <div class="px-3 py-2 border-b border-border/30 space-y-2">
      <div class="flex items-center gap-2">
        <div class="relative flex-1 min-w-0">
          <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            v-model="searchQuery"
            type="text"
            class="w-full h-8 pl-8 pr-3 text-sm rounded-md border border-border bg-background transition-colors outline-none focus:border-primary"
            :class="searchError ? 'border-destructive' : ''"
            :placeholder="t('search.placeholder')"
            @keydown.enter.prevent="runSearch"
          >
        </div>
        <button
          :aria-label="t('search.run')"
          :disabled="!searchQuery.trim() || searchLoading"
          class="w-8 h-8 flex items-center justify-center rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground shrink-0 border border-border disabled:opacity-40 disabled:cursor-not-allowed"
          :title="t('search.run')"
          @click="runSearch"
        >
          <RefreshCw
            v-if="searchLoading"
            class="w-4 h-4 animate-spin"
          />
          <Search
            v-else
            class="w-4 h-4"
          />
        </button>
        <button
          v-if="hasSearchState"
          :aria-label="t('search.clear')"
          class="w-8 h-8 flex items-center justify-center rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground shrink-0 border border-border"
          :title="t('search.clear')"
          @click="clearSearch"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <div
        v-if="searchError"
        class="text-xs text-destructive truncate"
      >
        {{ searchError }}
      </div>
      <div
        v-else-if="searchResults.length > 0"
        class="max-h-40 overflow-y-auto rounded-md border border-border/50 bg-background"
      >
        <button
          v-for="result in searchResults"
          :key="result.path"
          class="w-full px-2 py-1.5 text-left text-xs hover:bg-accent transition-colors"
          :title="result.path"
          @click="openSearchResult(result)"
        >
          <span class="block truncate font-medium text-foreground">{{ result.name }}</span>
          <span class="block truncate text-muted-foreground">{{ result.path }}</span>
        </button>
      </div>
      <div
        v-else-if="hasSearched && searchQuery.trim() && !searchLoading"
        class="text-xs text-muted-foreground"
      >
        {{ t('search.noResults') }}
      </div>
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
          <p
            v-if="createNodeError"
            class="text-sm text-red-500"
          >
            {{ createNodeError }}
          </p>
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
