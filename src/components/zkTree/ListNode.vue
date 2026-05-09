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
import { getErrorCode, getErrorMessage } from '../../utils/errors';

const { t } = i18n.global;

const props = defineProps<{
  node: ZkListNode;
  connectionUuid: string;
}>();

const zkTreeStore = useZkTreeStore();
const znodeTabsStore = useZnodeTabsStore();
const logsStore = useLogsStore();

// Create dialog state
const showCreateDialog = ref(false);
const newChildName = ref('');
const newChildData = ref('');

// Delete dialog state
const showDeleteDialog = ref(false);
const isDeleting = ref(false);

// Navigate into this node when clicking the name (activates existing tab or creates temporary tab)
const handleNavigate = async () => {
  try {
    const dirtyTemporaryTab = znodeTabsStore.getDirtyTemporaryTabForReplacement(
      props.connectionUuid,
      props.node.path,
    );
    if (dirtyTemporaryTab && !window.confirm(t('tabs.confirmReplaceDirty'))) {
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
  showCreateDialog.value = true;
};

const createChildNode = async () => {
  if (!newChildName.value.trim()) return;
  const childPath = props.node.path === '/' ? `/${newChildName.value.trim()}` : `${props.node.path}/${newChildName.value.trim()}`;
  const data = Array.from(new TextEncoder().encode(newChildData.value));
  try {
    await zkApi.createNode(props.connectionUuid, childPath, data);
    await logsStore.addLog(props.connectionUuid, 'CREATE', `Created node ${childPath}`);
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

const confirmDelete = async () => {
  isDeleting.value = true;
  try {
    await zkApi.deleteNode(props.connectionUuid, props.node.path);
    await logsStore.addLog(props.connectionUuid, 'DELETE', `Deleted node ${props.node.path}`);
    znodeTabsStore.delTab(props.connectionUuid, props.node.path);
    await zkTreeStore.onNodeDeleted(props.connectionUuid, props.node.path);
    showDeleteDialog.value = false;
    showToast.success(t('node.deleteSuccess'));
  } catch (err: unknown) {
    if (
      getErrorCode(err) === 'NOT_EMPTY'
      && window.confirm(t('node.confirmRecursiveDelete', { path: props.node.path }))
    ) {
      if (
        znodeTabsStore.hasDirtyTabsByPathPrefix(props.connectionUuid, props.node.path)
        && !window.confirm(t('tabs.confirmRecursiveDeleteDirty'))
      ) {
        return;
      }
      try {
        await zkApi.deleteNodeRecursive(props.connectionUuid, props.node.path);
        await logsStore.addLog(props.connectionUuid, 'DELETE', `Recursively deleted node ${props.node.path}`);
        znodeTabsStore.closeTabsByPathPrefix(props.connectionUuid, props.node.path);
        await zkTreeStore.onNodeDeleted(props.connectionUuid, props.node.path);
        showDeleteDialog.value = false;
        showToast.success(t('node.deleteSuccess'));
        return;
      } catch (recursiveError) {
        const recursiveErrorMsg = getErrorMessage(recursiveError);
        await logsStore.addLog(
          props.connectionUuid,
          'DELETE',
          `Failed to recursively delete node ${props.node.path}: ${recursiveErrorMsg}`,
          false,
        );
        showToast.error(recursiveErrorMsg);
        return;
      }
    }
    const errorMsg = getErrorMessage(err);
    await logsStore.addLog(props.connectionUuid, 'DELETE', `Failed to delete node ${props.node.path}: ${errorMsg}`, false);
    showToast.error(errorMsg);
  } finally {
    isDeleting.value = false;
  }
};
</script>

<template>
  <div class="list-node group">
    <ContextMenu>
      <ContextMenuTrigger>
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
        <ContextMenuItem @click="handleOpenInTab">
          {{ t('node.openInNewTab') }}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem @click="openCreateDialog">
          {{ t('node.createChild') }}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem @click="openDeleteDialog">
          {{ t('node.delete') }}
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
