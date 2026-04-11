<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ZkTreeNode } from '../../stores/zkTree';
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

const { t } = i18n.global;

const props = defineProps<{
  node: ZkTreeNode;
  connectionUuid: string;
  depth: number;
}>();

const zkTreeStore = useZkTreeStore();
const znodeTabsStore = useZnodeTabsStore();
const logsStore = useLogsStore();

// Create child dialog state
const showCreateDialog = ref(false);
const newChildName = ref('');
const newChildData = ref('');

const arrow = computed(() => {
  if (props.node.loading) return '...';
  return props.node.expanded ? '▼' : '▶';
});

const handleToggle = async () => {
  const wasExpanded = props.node.expanded;
  await zkTreeStore.toggle(props.connectionUuid, props.node);
  // Log expand operation
  if (!wasExpanded && props.node.expanded) {
    await logsStore.addLog(props.connectionUuid, 'LIST', `Expanded node ${props.node.path}`);
  }
};

const handleSelect = async () => {
  const details = await zkApi.getDetails(props.node.path);
  znodeTabsStore.addTab({
    connectionUuid: props.connectionUuid,
    path: props.node.path,
    znodeData: details.data,
    stat: details.stat,
    acl: details.acl,
    isActive: true,
  });
  await logsStore.addLog(props.connectionUuid, 'GET', `Viewed node ${props.node.path}`);
};

// Context menu actions
const openInNewTab = async () => {
  const details = await zkApi.getDetails(props.node.path);
  znodeTabsStore.addTab({
    connectionUuid: props.connectionUuid,
    path: props.node.path,
    znodeData: details.data,
    stat: details.stat,
    acl: details.acl,
    isActive: true,
  });
  await logsStore.addLog(props.connectionUuid, 'GET', `Viewed node ${props.node.path} in new tab`);
};

const openCreateDialog = () => {
  newChildName.value = '';
  newChildData.value = '';
  showCreateDialog.value = true;
};

const createChildNode = async () => {
  if (!newChildName.value.trim()) return;
  const childPath = props.node.path === '/' ? `/${newChildName.value.trim()}` : `${props.node.path}/${newChildName.value.trim()}`;
  try {
    await zkApi.createNode(childPath, []);
    await logsStore.addLog(props.connectionUuid, 'CREATE', `Created node ${childPath}`);
    showCreateDialog.value = false;
    alert(t('node.createSuccess', { path: childPath }));
    zkTreeStore.refreshNode(props.connectionUuid, props.node.path);
  } catch (err) {
    await logsStore.addLog(props.connectionUuid, 'CREATE', `Failed to create node ${childPath}: ${err}`);
    alert(`${t('node.createFailed')}: ${err}`);
  }
};

const deleteThisNode = async () => {
  if (!window.confirm(t('node.confirmDelete', { path: props.node.path }))) return;
  try {
    await zkApi.deleteNode(props.node.path);
    await logsStore.addLog(props.connectionUuid, 'DELETE', `Deleted node ${props.node.path}`);
    znodeTabsStore.delTab(props.node.path);
    zkTreeStore.removeNode(props.connectionUuid, props.node.path);
  } catch (err) {
    await logsStore.addLog(props.connectionUuid, 'DELETE', `Failed to delete node ${props.node.path}: ${err}`);
    alert(`${t('node.deleteFailed')}: ${err}`);
  }
};
</script>

<template>
  <div class="tree-node">
    <ContextMenu>
      <ContextMenuTrigger>
        <div
          class="flex items-center gap-1 px-1 py-0.5 hover:bg-accent cursor-pointer rounded"
          :style="{ paddingLeft: depth * 16 + 'px' }"
        >
          <span
            class="w-4 flex items-center justify-center text-xs"
            @click.stop="handleToggle"
          >
            <span v-if="node.hasChildren || node.children.length">{{ arrow }}</span>
          </span>
          <span
            class="truncate text-sm"
            @click="handleSelect"
          >
            {{ node.name }}
          </span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem @click="openInNewTab">
          {{ t('node.openInNewTab') }}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem @click="openCreateDialog">
          {{ t('node.createChild') }}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem @click="deleteThisNode">
          {{ t('node.delete') }}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
    <div v-if="node.expanded">
      <TreeNode
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :connection-uuid="connectionUuid"
        :depth="depth + 1"
      />
    </div>

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
          <Button variant="outline" @click="showCreateDialog = false">{{ t('connection.cancel') }}</Button>
          <Button @click="createChildNode">{{ t('connection.save') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>