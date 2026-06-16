<script setup lang="ts">
import { ref } from 'vue';
import type { ZkListNode } from '../../stores/zkTree';
import { useZkTreeStore } from '../../stores/zkTree';
import { useZnodeTabsStore } from '../../stores/znodeTabs';
import { useLogsStore } from '../../stores/logs';
import { zkApi } from '../../api/zk';
import i18n from '../../i18n';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from '../ui/context-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { showToast } from '../../utils/toast';
import { getErrorMessage } from '../../utils/errors';
import { confirmDialog } from '../../composables/useConfirmDialog';
import { useZnodeDelete } from '../../composables/useZnodeDelete';
import { exportZnodeSubtree } from '../../composables/useZnodeExport';

const { t } = i18n.global;

const props = defineProps<{
  node: ZkListNode;
  connectionUuid: string;
}>();

const zkTreeStore = useZkTreeStore();
const znodeTabsStore = useZnodeTabsStore();
const logsStore = useLogsStore();
const { deleteNode, deleteNodeRecursive } = useZnodeDelete();

// Create dialog state
const showCreateDialog = ref(false);
const newChildName = ref('');
const newChildData = ref('');
const createMissingParents = ref(false);

// Delete dialog state
const showDeleteDialog = ref(false);
const isDeleting = ref(false);
const isExporting = ref(false);

// Navigate into this node when clicking the name (activates existing tab or creates temporary tab)
const handleNavigate = async () => {
  try {
    const dirtyTemporaryTab = znodeTabsStore.getDirtyTemporaryTabForReplacement(
      props.connectionUuid,
      props.node.path,
    );
    if (dirtyTemporaryTab && !(await confirmDialog(t('tabs.confirmReplaceDirty')))) {
      return;
    }
    await zkTreeStore.navigateTo(props.connectionUuid, props.node.path);
    const details = await zkApi.getDetails(props.connectionUuid, props.node.path);
    const activatedExisting = znodeTabsStore.replaceOrCreateTemporaryTab({
      connectionUuid: props.connectionUuid,
      path: props.node.path,
      znodeData: details.data,
      stat: details.stat,
      acl: details.acl,
      isActive: true,
      isTemporary: true,
    });
    if (activatedExisting) {
      await logsStore.addLog(props.connectionUuid, 'NAVIGATE', `Activated existing tab for ${props.node.path}`);
    } else {
      await logsStore.addLog(props.connectionUuid, 'NAVIGATE', `Navigated to ${props.node.path}`);
    }
  } catch (err) {
    console.error('handleNavigate error:', err);
    showToast.error(`Navigation failed: ${err}`);
  }
};

// Open node in new tab (for right-click, creates permanent tab)
const handleOpenInTab = async () => {
  const details = await zkApi.getDetails(props.connectionUuid, props.node.path);
  const tabExisted = znodeTabsStore.addTab({
    connectionUuid: props.connectionUuid,
    path: props.node.path,
    znodeData: details.data,
    stat: details.stat,
    acl: details.acl,
    isActive: true,
    isTemporary: false, // Permanent tab
  });
  if (tabExisted) {
    // Tab already existed, refresh it to get latest data
    znodeTabsStore.updateTab(props.connectionUuid, props.node.path, {
      znodeData: details.data,
      stat: details.stat,
      acl: details.acl,
    });
    await logsStore.addLog(props.connectionUuid, 'REFRESH', `Refreshed existing tab for ${props.node.path}`);
  } else {
    await logsStore.addLog(props.connectionUuid, 'GET', `Viewed node ${props.node.path} in new tab`);
  }
};

// Context menu actions
const openCreateDialog = () => {
  newChildName.value = '';
  newChildData.value = '';
  createMissingParents.value = false;
  showCreateDialog.value = true;
};

const buildChildPath = (parentPath: string, childName: string) => {
  const relativePath = childName.trim().split('/').filter(Boolean).join('/');
  if (!relativePath) return '';
  return parentPath === '/' ? `/${relativePath}` : `${parentPath}/${relativePath}`;
};

const createChildNode = async () => {
  const childPath = buildChildPath(props.node.path, newChildName.value);
  if (!childPath) return;
  const data = Array.from(new TextEncoder().encode(newChildData.value));
  try {
    if (createMissingParents.value) {
      await zkApi.createNodeRecursive(props.connectionUuid, childPath, data);
    } else {
      await zkApi.createNode(props.connectionUuid, childPath, data);
    }
    const logMessage = createMissingParents.value
      ? `Recursively created node ${childPath}`
      : `Created node ${childPath}`;
    await logsStore.addLog(props.connectionUuid, 'CREATE', logMessage);
    await zkTreeStore.onNodeCreated(props.connectionUuid, props.node.path);
    showCreateDialog.value = false;
    showToast.success(t('node.createSuccess', { path: childPath }));
  } catch (err) {
    const errorMsg = getErrorMessage(err);
    await logsStore.addLog(props.connectionUuid, 'CREATE', `Failed to create node ${childPath}: ${errorMsg}`, false);
    showToast.error(`${t('node.createFailed')}: ${errorMsg}`);
  }
};

const openDeleteDialog = () => {
  showDeleteDialog.value = true;
};

const handleExportNode = async () => {
  if (isExporting.value) return;
  const confirmed = await confirmDialog({
    title: t('node.confirmExportTitle'),
    message: t('node.confirmExportMsg', { path: props.node.path }),
    confirmText: t('node.export'),
  });
  if (!confirmed) return;

  isExporting.value = true;
  try {
    const result = await exportZnodeSubtree({
      connectionUuid: props.connectionUuid,
      path: props.node.path,
    });
    if (result.status === 'cancelled') return;

    await logsStore.addLog(
      props.connectionUuid,
      'EXPORT',
      `Exported node ${props.node.path} to ${result.filePath}, count: ${result.nodeCount}`,
    );
    showToast.success(t('node.exportSuccess', { count: result.nodeCount }));
  } catch (err) {
    const errorMsg = getErrorMessage(err);
    await logsStore.addLog(
      props.connectionUuid,
      'EXPORT',
      `Failed to export node ${props.node.path}: ${errorMsg}`,
      false,
    );
    showToast.error(`${t('node.exportFailed')}: ${errorMsg}`);
  } finally {
    isExporting.value = false;
  }
};

const confirmDelete = async () => {
  isDeleting.value = true;
  try {
    const deleted = await deleteNode({
      connectionUuid: props.connectionUuid,
      path: props.node.path,
      logConnectionName: props.connectionUuid,
    });
    if (deleted) {
      showDeleteDialog.value = false;
    }
  } finally {
    isDeleting.value = false;
  }
};

const confirmRecursiveDelete = async () => {
  isDeleting.value = true;
  try {
    await deleteNodeRecursive({
      connectionUuid: props.connectionUuid,
      path: props.node.path,
      logConnectionName: props.connectionUuid,
    });
  } finally {
    isDeleting.value = false;
  }
};
</script>

<template>
  <div class="list-node group">
    <ContextMenu>
      <ContextMenuTrigger as-child>
        <div
          class="flex items-center px-3 py-1.5 hover:bg-accent/70 cursor-pointer transition-colors mx-1"
          @click="handleNavigate"
        >
          <span class="text-sm text-foreground/80 group-hover:text-foreground transition-colors">
            {{ node.name }}
          </span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem @select="handleOpenInTab">
          {{ t('node.openInNewTab') }}
        </ContextMenuItem>
        <ContextMenuItem
          :disabled="isExporting"
          @select="handleExportNode"
        >
          {{ t('node.export') }}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem @select="openCreateDialog">
          {{ t('node.createChild') }}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          @select="openDeleteDialog"
        >
          {{ t('node.delete') }}
        </ContextMenuItem>
        <ContextMenuItem
          variant="destructive"
          @select="confirmRecursiveDelete"
        >
          {{ t('node.deleteRecursive') }}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>

    <!-- Create Child Dialog -->
    <Dialog v-model:open="showCreateDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ t('createNode.title') }}</DialogTitle>
        </DialogHeader>
        <div class="space-y-4 py-4">
          <div>
            <Label for="childName">{{ t('createNode.nodeName') }}</Label>
            <Input
              id="childName"
              v-model="newChildName"
              :placeholder="t('createNode.placeholder.name')"
            />
          </div>
          <div>
            <Label for="childData">{{ t('createNode.nodeData') }}</Label>
            <Input
              id="childData"
              v-model="newChildData"
              :placeholder="t('createNode.placeholder.data')"
            />
          </div>
          <label class="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              v-model="createMissingParents"
              type="checkbox"
              class="size-4 rounded border-input"
            >
            <span>{{ t('createNode.createMissingParents') }}</span>
          </label>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            @click="showCreateDialog = false"
          >
            {{ t('connection.cancel') }}
          </Button>
          <Button @click="createChildNode">
            {{ t('connection.save') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Delete Confirmation Dialog -->
    <Dialog v-model:open="showDeleteDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ t('node.confirmDeleteTitle') }}</DialogTitle>
        </DialogHeader>
        <div class="py-4">
          <p class="text-sm text-muted-foreground">
            {{ t('node.confirmDeleteMsg', { path: props.node.path }) }}
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            @click="showDeleteDialog = false"
          >
            {{ t('connection.cancel') }}
          </Button>
          <Button
            variant="destructive"
            :disabled="isDeleting"
            @click="confirmDelete"
          >
            {{ t('node.delete') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style scoped>
.fade-in { animation: fadeIn 0.1s ease-out; }
</style>
