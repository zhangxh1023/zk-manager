<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { ChevronRight, ChevronDown, Settings, ClipboardClock, Database } from 'lucide-vue-next';
import ZkList from '../zkTree/ZkList.vue';
import { useConnectionsStore, type Connection } from '../../stores/connections';
import { useZnodeTabsStore } from '../../stores/znodeTabs';
import { zkApi } from '../../api/zk';
import { useLogsStore } from '../../stores/logs';
import { useI18n } from 'vue-i18n';
import { showToast } from '../../utils/toast';
import { getErrorMessage, isSshHostKeyUntrustedError } from '../../utils/errors';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '../ui/context-menu';
import ConnectionDialog from './ConnectionDialog.vue';
import AppMenus from '../appMenus/AppMenus.vue';
import { confirmDialog } from '../../composables/useConfirmDialog';

const { t } = useI18n();
const connectionsStore = useConnectionsStore();
const logsStore = useLogsStore();
const znodeTabsStore = useZnodeTabsStore();
type ConnectionDropPosition = 'before' | 'after';
type PendingConnectionDrag = {
  uuid: string;
  pointerId: number;
  grabOffsetX: number;
  grabOffsetY: number;
  rowWidth: number;
  startX: number;
  startY: number;
};
type ConnectionDragGhost = {
  uuid: string;
  x: number;
  y: number;
  width: number;
};

const CONNECTION_DRAG_THRESHOLD_PX = 4;
const CONNECTION_DRAG_GHOST_MIN_WIDTH = 160;
const CONNECTION_DRAG_GHOST_MAX_WIDTH = 320;

// Connection Dialog State
const showConnectionDialog = ref(false);
const currentDialogMode = ref<'add' | 'edit'>('add');
const activeConnectionToEdit = ref<Connection | null>(null);
const connectionDialogSaving = ref(false);
const connectionDialogTesting = ref(false);
const connectionDialogError = ref('');
const connectionToDelete = ref<Connection | null>(null);
const isDeletingConnection = ref(false);
const draggedConnectionUuid = ref<string | null>(null);
const connectionDropTarget = ref<{ uuid: string; position: ConnectionDropPosition } | null>(null);
const previewConnectionUuids = ref<string[] | null>(null);
const pendingConnectionDrag = ref<PendingConnectionDrag | null>(null);
const connectionDragGhost = ref<ConnectionDragGhost | null>(null);
const suppressConnectionClick = ref(false);
const isReorderingConnections = ref(false);
const showDeleteConnectionDialog = computed({
  get: () => Boolean(connectionToDelete.value),
  set: (open: boolean) => {
    if (!open && !isDeletingConnection.value) {
      connectionToDelete.value = null;
    }
  },
});
const deleteConnectionMessage = computed(() => {
  const conn = connectionToDelete.value;
  if (!conn) return '';
  if (znodeTabsStore.hasDirtyTabsByConnection(conn.uuid)) {
    return t('connection.confirmDeleteDirty', { name: conn.name || conn.uuid });
  }
  return t('connection.confirmDeleteNamed', { name: conn.name || conn.uuid });
});
type SshHostKeyPrompt = {
  host: string;
  port: number;
  resolve: (trusted: boolean) => void;
};
const sshHostKeyPrompt = ref<SshHostKeyPrompt | null>(null);
const showSshHostKeyDialog = computed({
  get: () => Boolean(sshHostKeyPrompt.value),
  set: (open: boolean) => {
    if (!open) {
      resolveSshHostKeyPrompt(false);
    }
  },
});
const sshHostKeyPromptMessage = computed(() => {
  const prompt = sshHostKeyPrompt.value;
  if (!prompt) return '';
  return t('connection.confirmUnknownSshHostKey', {
    host: prompt.host,
    port: prompt.port,
  });
});

// Open AppMenus triggers
const appMenusRef = ref<InstanceType<typeof AppMenus> | null>(null);

const disconnect = async (conn: Connection): Promise<boolean> => {
  if (
    znodeTabsStore.hasDirtyTabsByConnection(conn.uuid)
    && !(await confirmDialog(t('tabs.confirmDisconnectDirty')))
  ) {
    return false;
  }
  await connectionsStore.disconnectConnection(conn);
  znodeTabsStore.closeTabsByConnection(conn.uuid);
  return true;
};

const resolveSshHostKeyPrompt = (trusted: boolean) => {
  const prompt = sshHostKeyPrompt.value;
  if (!prompt) return;
  sshHostKeyPrompt.value = null;
  prompt.resolve(trusted);
};

const confirmUnknownSshHostKey = (sshHost?: string, sshPort?: number) => {
  if (!sshHost) return Promise.resolve(false);
  const existingPrompt = sshHostKeyPrompt.value;
  if (existingPrompt) {
    existingPrompt.resolve(false);
  }
  return new Promise<boolean>((resolve) => {
    sshHostKeyPrompt.value = {
      host: sshHost,
      port: sshPort || 22,
      resolve,
    };
  });
};

const toggleConnection = async (conn: Connection) => {
  try {
    await connectionsStore.toggleConnection(conn);
  } catch (err) {
    const shouldTrustUnknownHostKey = isSshHostKeyUntrustedError(err)
      ? await confirmUnknownSshHostKey(conn.ssh_host, conn.ssh_port)
      : false;
    if (shouldTrustUnknownHostKey) {
      try {
        await connectionsStore.toggleConnection(conn, { trustUnknownSshHostKey: true });
        return;
      } catch (retryError) {
        const retryErrorMsg = getErrorMessage(retryError);
        showToast.error(`连接失败: ${retryErrorMsg}`);
        return;
      }
    }
    const errorMsg = getErrorMessage(err);
    showToast.error(`连接失败: ${errorMsg}`);
  }
};

const isConnected = connectionsStore.isConnected;
const isConnecting = connectionsStore.isConnecting;
const isExpanded = connectionsStore.isExpanded;

const connectionsByUuid = computed(() =>
  new Map(connectionsStore.connections.map(conn => [conn.uuid, conn])),
);

const draggedConnection = computed(() =>
  connectionDragGhost.value
    ? connectionsByUuid.value.get(connectionDragGhost.value.uuid) || null
    : null,
);

const displayedConnections = computed(() => {
  if (!previewConnectionUuids.value) return connectionsStore.connections;
  const previewedConnections = previewConnectionUuids.value
    .map(uuid => connectionsByUuid.value.get(uuid))
    .filter((conn): conn is Connection => Boolean(conn));
  const previewedUuidSet = new Set(previewConnectionUuids.value);
  const remainingConnections = connectionsStore.connections.filter(conn => !previewedUuidSet.has(conn.uuid));
  return [...previewedConnections, ...remainingConnections];
});

const sameConnectionOrder = (orderedUuids: string[]) =>
  orderedUuids.length === connectionsStore.connections.length
  && orderedUuids.every((uuid, index) => uuid === connectionsStore.connections[index]?.uuid);

const samePreviewOrder = (orderedUuids: string[]) => {
  const currentOrder = previewConnectionUuids.value || connectionsStore.connections.map(conn => conn.uuid);
  return orderedUuids.length === currentOrder.length
    && orderedUuids.every((uuid, index) => uuid === currentOrder[index]);
};

const clearConnectionDragState = (options: { suppressClick?: boolean } = {}) => {
  if (options.suppressClick && draggedConnectionUuid.value) {
    suppressConnectionClick.value = true;
    window.setTimeout(() => {
      suppressConnectionClick.value = false;
    }, 0);
  }
  draggedConnectionUuid.value = null;
  connectionDropTarget.value = null;
  previewConnectionUuids.value = null;
  pendingConnectionDrag.value = null;
  connectionDragGhost.value = null;
};

const connectionRows = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-connection-row="true"]'));

const previewOrderForPointer = (draggedUuid: string, clientY: number) => {
  const rowEntries = connectionRows()
    .map((row) => {
      const uuid = row.dataset.connectionUuid;
      if (!uuid || uuid === draggedUuid) return null;
      return {
        uuid,
        rect: row.getBoundingClientRect(),
      };
    })
    .filter((entry): entry is { uuid: string; rect: DOMRect } => Boolean(entry));
  const withoutDragged = displayedConnections.value
    .map(conn => conn.uuid)
    .filter(uuid => uuid !== draggedUuid);
  let insertionIndex = withoutDragged.length;

  for (let index = 0; index < rowEntries.length; index += 1) {
    const middleY = rowEntries[index].rect.top + rowEntries[index].rect.height / 2;
    if (clientY < middleY) {
      insertionIndex = index;
      break;
    }
  }

  const orderedUuids = [...withoutDragged];
  orderedUuids.splice(insertionIndex, 0, draggedUuid);
  const targetUuid = withoutDragged[Math.min(insertionIndex, withoutDragged.length - 1)];

  return {
    orderedUuids,
    target: targetUuid
      ? {
        uuid: targetUuid,
        position: (insertionIndex >= withoutDragged.length ? 'after' : 'before') as ConnectionDropPosition,
      }
      : null,
  };
};

const updateConnectionPreviewForPointer = (clientY: number) => {
  const draggedUuid = draggedConnectionUuid.value;
  if (!draggedUuid) return;
  const { orderedUuids, target } = previewOrderForPointer(draggedUuid, clientY);
  connectionDropTarget.value = target;
  if (!samePreviewOrder(orderedUuids)) {
    previewConnectionUuids.value = orderedUuids;
  }
};

const updateConnectionDragGhost = (pending: PendingConnectionDrag, event: PointerEvent) => {
  connectionDragGhost.value = {
    uuid: pending.uuid,
    x: event.clientX - pending.grabOffsetX,
    y: event.clientY - pending.grabOffsetY,
    width: Math.min(
      CONNECTION_DRAG_GHOST_MAX_WIDTH,
      Math.max(CONNECTION_DRAG_GHOST_MIN_WIDTH, pending.rowWidth),
    ),
  };
};

const startConnectionPointerDrag = (pending: PendingConnectionDrag, event: PointerEvent) => {
  draggedConnectionUuid.value = pending.uuid;
  previewConnectionUuids.value = connectionsStore.connections.map(conn => conn.uuid);
  updateConnectionDragGhost(pending, event);
  updateConnectionPreviewForPointer(event.clientY);
};

const saveConnectionPreviewOrder = async () => {
  const orderedUuids = previewConnectionUuids.value;
  if (!orderedUuids || sameConnectionOrder(orderedUuids)) return;

  isReorderingConnections.value = true;
  try {
    await connectionsStore.reorderConnections(orderedUuids);
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    showToast.error(t('connection.reorderFailed', { message: errorMessage }));
  } finally {
    isReorderingConnections.value = false;
  }
};

const removeConnectionPointerListeners = () => {
  window.removeEventListener('pointermove', onConnectionPointerMove);
  window.removeEventListener('pointerup', onConnectionPointerUp);
  window.removeEventListener('pointercancel', onConnectionPointerCancel);
};

const onConnectionPointerDown = (conn: Connection, event: PointerEvent) => {
  if (isReorderingConnections.value) {
    event.preventDefault();
    return;
  }
  if (event.button !== 0) {
    return;
  }
  const row = event.currentTarget as HTMLElement | null;
  const rowRect = row?.getBoundingClientRect();
  const rowWidth = rowRect?.width || CONNECTION_DRAG_GHOST_MIN_WIDTH;
  pendingConnectionDrag.value = {
    uuid: conn.uuid,
    pointerId: event.pointerId,
    grabOffsetX: rowRect ? event.clientX - rowRect.left : 0,
    grabOffsetY: rowRect ? event.clientY - rowRect.top : 0,
    rowWidth,
    startX: event.clientX,
    startY: event.clientY,
  };
  window.addEventListener('pointermove', onConnectionPointerMove);
  window.addEventListener('pointerup', onConnectionPointerUp);
  window.addEventListener('pointercancel', onConnectionPointerCancel);
};

const onConnectionPointerMove = (event: PointerEvent) => {
  const pending = pendingConnectionDrag.value;
  if (!pending || event.pointerId !== pending.pointerId) return;

  if (!draggedConnectionUuid.value) {
    const distance = Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY);
    if (distance < CONNECTION_DRAG_THRESHOLD_PX) return;
    startConnectionPointerDrag(pending, event);
  } else {
    updateConnectionDragGhost(pending, event);
    updateConnectionPreviewForPointer(event.clientY);
  }
  event.preventDefault();
};

const onConnectionPointerUp = async (event: PointerEvent) => {
  const pending = pendingConnectionDrag.value;
  if (!pending || event.pointerId !== pending.pointerId) return;

  removeConnectionPointerListeners();
  const wasDragging = Boolean(draggedConnectionUuid.value);
  if (wasDragging) {
    updateConnectionPreviewForPointer(event.clientY);
    await saveConnectionPreviewOrder();
  }
  clearConnectionDragState({ suppressClick: wasDragging });
};

const onConnectionPointerCancel = (event: PointerEvent) => {
  const pending = pendingConnectionDrag.value;
  if (!pending || event.pointerId !== pending.pointerId) return;

  removeConnectionPointerListeners();
  clearConnectionDragState({ suppressClick: Boolean(draggedConnectionUuid.value) });
};

onBeforeUnmount(() => {
  removeConnectionPointerListeners();
});

const isConnectionDropTarget = (uuid: string, position: ConnectionDropPosition) =>
  connectionDropTarget.value?.uuid === uuid && connectionDropTarget.value.position === position;

const onConnectionClick = (conn: Connection, event: MouseEvent) => {
  if (suppressConnectionClick.value) {
    event.preventDefault();
    return;
  }
  void toggleConnection(conn);
};

const openAddDialog = () => {
  currentDialogMode.value = 'add';
  activeConnectionToEdit.value = null;
  connectionDialogError.value = '';
  showConnectionDialog.value = true;
};

const openEditDialog = async (conn: Connection, event?: Event) => {
  if (event) event.stopPropagation();
  if (connectionsStore.isConnected(conn.uuid)) {
    const shouldDisconnect = await confirmDialog({
      title: t('connection.confirmEditDisconnectTitle'),
      message: t('connection.confirmEditDisconnect'),
      confirmText: t('connection.disconnect'),
      cancelText: t('connection.cancel'),
    });
    if (!shouldDisconnect || !(await disconnect(conn))) {
      return;
    }
  }
  currentDialogMode.value = 'edit';
  connectionDialogError.value = '';
  const secrets = await connectionsStore.loadConnectionSecrets(conn.uuid);
  activeConnectionToEdit.value = { ...conn, ...secrets };
  showConnectionDialog.value = true;
};

const openDeleteConnectionDialog = (conn: Connection, event?: Event) => {
  if (event) event.stopPropagation();
  connectionToDelete.value = conn;
};

const deleteConnection = async () => {
  const conn = connectionToDelete.value;
  if (!conn) return;
  isDeletingConnection.value = true;
  try {
    if (connectionsStore.isConnected(conn.uuid)) {
      await connectionsStore.disconnectConnection(conn);
    }
    connectionsStore.forgetConnectionState(conn.uuid);
    znodeTabsStore.closeTabsByConnection(conn.uuid);
  
    await connectionsStore.removeConnection(conn.uuid);
    await logsStore.addLog(conn.name || conn.uuid, 'DELETE_CONNECTION', `Deleted connection ${conn.name}`);
    connectionToDelete.value = null;
    showToast.success(t('connection.deleteSuccess'));
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    showToast.error(errorMessage);
  } finally {
    isDeletingConnection.value = false;
  }
};

const onDialogSave = async (connData: Omit<Connection, 'uuid'> & { uuid?: string }) => {
  connectionDialogSaving.value = true;
  connectionDialogError.value = '';
  try {
    if (currentDialogMode.value === 'add') {
      const { v4: uuidv4 } = await import('uuid');
      connData.uuid = uuidv4();
      await connectionsStore.addConnection(connData as Connection);
    } else {
      await connectionsStore.updateConnection(connData as Connection);
    }
    showConnectionDialog.value = false;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    connectionDialogError.value = errorMessage;
    showToast.error(errorMessage);
  } finally {
    connectionDialogSaving.value = false;
  }
};

const onDialogTest = async (connData: Omit<Connection, 'uuid'> & { uuid?: string }) => {
  if (!connData.url) return;
  const testUuid = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  connectionDialogTesting.value = true;
  connectionDialogError.value = '';
  let trustUnknownSshHostKey = false;
  try {
    for (;;) {
      try {
        await zkApi.connect(
          testUuid,
          connData.url,
          connData.username,
          connData.password,
          connData.use_ssh,
          connData.ssh_host,
          connData.ssh_port,
          connData.ssh_username,
          connData.ssh_auth_method,
          connData.ssh_password,
          connData.ssh_key_path,
          trustUnknownSshHostKey,
        );
        break;
      } catch (error) {
        const shouldTrustUnknownHostKey = !trustUnknownSshHostKey && isSshHostKeyUntrustedError(error)
          ? await confirmUnknownSshHostKey(connData.ssh_host, connData.ssh_port)
          : false;
        if (shouldTrustUnknownHostKey) {
          trustUnknownSshHostKey = true;
          continue;
        }
        throw error;
      }
    }
    showToast.success(t('connection.testSuccess'));
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    connectionDialogError.value = errorMessage;
    showToast.error(t('connection.testFailed', { message: errorMessage }));
  } finally {
    await zkApi.disconnect(testUuid).catch(() => {});
    connectionDialogTesting.value = false;
  }
};
</script>

<template>
  <div class="flex h-full w-full bg-sidebar">
    <!-- Activity Bar (Far Left) -->
    <div class="w-12 border-r border-sidebar-border flex flex-col items-center py-4 bg-sidebar-accent/30 gap-4 shrink-0">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              :aria-label="t('app.newConnection')"
              variant="ghost"
              size="icon"
              class="rounded-xl h-10 w-10 text-muted-foreground hover:text-foreground"
              @click="openAddDialog"
            >
              <Database class="size-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>{{ t('app.newConnection') }}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <div class="mt-auto flex flex-col gap-4">
        <!-- These triggers map directly to the AppMenus which we will mount invisibly -->
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                :aria-label="t('app.settings')"
                variant="ghost"
                size="icon"
                class="rounded-xl h-10 w-10 text-muted-foreground hover:text-foreground"
                @click="appMenusRef?.openSettings()"
              >
                <Settings class="size-[22px]" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>{{ t('app.settings') }}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                :aria-label="t('app.logs')"
                variant="ghost"
                size="icon"
                class="rounded-xl h-10 w-10 text-muted-foreground hover:text-foreground"
                @click="appMenusRef?.openLogs()"
              >
                <ClipboardClock class="size-[22px]" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>{{ t('app.logs') }}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>

    <!-- Main Sidebar (Connections list) -->
    <div class="flex-1 flex flex-col min-w-0 mac-sidebar">
      <div class="h-12 border-b border-sidebar-border flex items-center px-4 shrink-0">
        <span class="text-xs font-semibold tracking-wider text-muted-foreground">CONNECTIONS</span>
      </div>
      
      <div class="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        <div
          v-for="conn in displayedConnections"
          :key="conn.uuid"
          class="group relative"
          :class="draggedConnectionUuid === conn.uuid ? 'opacity-60' : ''"
        >
          <div
            v-if="isConnectionDropTarget(conn.uuid, 'before')"
            class="pointer-events-none absolute left-2 right-2 top-0 z-10 h-px bg-primary"
          />
          <div
            v-if="isConnectionDropTarget(conn.uuid, 'after')"
            class="pointer-events-none absolute bottom-0 left-2 right-2 z-10 h-px bg-primary"
          />
          <!-- Connection Name Header with Context Menu -->
          <ContextMenu>
            <ContextMenuTrigger as-child>
              <div
                class="flex select-none items-center gap-2 px-2 py-1.5 rounded-md cursor-grab hover:bg-sidebar-accent transition-colors text-[13px] active:cursor-grabbing"
                :class="[
                  connectionDropTarget?.uuid === conn.uuid ? 'bg-sidebar-accent/70' : '',
                  isReorderingConnections ? 'pointer-events-none opacity-70' : '',
                ]"
                :title="t('connection.dragToReorder')"
                :data-testid="`connection-row-${conn.uuid}`"
                data-connection-row="true"
                :data-connection-uuid="conn.uuid"
                @click="onConnectionClick(conn, $event)"
                @pointerdown="onConnectionPointerDown(conn, $event)"
              >
                <component
                  :is="isExpanded(conn.uuid) ? ChevronDown : ChevronRight"
                  class="w-3.5 h-3.5 text-muted-foreground shrink-0"
                />
                
                <div class="relative shrink-0 flex items-center justify-center size-3.5">
                  <svg
                    v-if="isConnecting(conn.uuid)"
                    class="animate-spin text-muted-foreground size-3.5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  ><circle
                    class="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                  /><path
                    class="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  /></svg>
                  <Database
                    v-else-if="!isConnected(conn.uuid)"
                    class="w-3.5 h-3.5 text-muted-foreground/70"
                  />
                  <Database
                    v-else
                    class="w-3.5 h-3.5 text-green-500"
                  />
                  <div
                    v-if="isConnected(conn.uuid) && !isConnecting(conn.uuid)"
                    class="absolute -bottom-0.5 -right-0.5 w-[6px] h-[6px] bg-green-500 rounded-full border border-background"
                  />
                </div>
                
                <span class="truncate font-medium flex-1 text-sidebar-foreground">{{ conn.name }}</span>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem @select="openEditDialog(conn, $event)">
                {{ t('connection.edit') }}
              </ContextMenuItem>
              <ContextMenuItem
                v-if="isConnected(conn.uuid)"
                @select="disconnect(conn)"
              >
                {{ t('connection.disconnect') }}
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                variant="destructive"
                @select="openDeleteConnectionDialog(conn, $event)"
              >
                {{ t('connection.delete') }}
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>

          <!-- Tree rendered inside connection -->
          <div
            v-if="isExpanded(conn.uuid)"
            class="ml-6 py-1 pr-1 border-l border-sidebar-border"
          >
            <ZkList
              :connection-uuid="conn.uuid"
              :connected="true"
            />
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="connectionDragGhost && draggedConnection"
      data-testid="connection-drag-ghost"
      class="pointer-events-none fixed z-50 flex select-none items-center gap-2 rounded-md border border-sidebar-border bg-sidebar/95 px-2 py-1.5 text-[13px] text-sidebar-foreground opacity-80 shadow-lg backdrop-blur-md"
      :style="{
        left: `${connectionDragGhost.x}px`,
        top: `${connectionDragGhost.y}px`,
        width: `${connectionDragGhost.width}px`,
      }"
    >
      <component
        :is="isExpanded(draggedConnection.uuid) ? ChevronDown : ChevronRight"
        class="w-3.5 h-3.5 text-muted-foreground shrink-0"
      />
      <div class="relative shrink-0 flex items-center justify-center size-3.5">
        <svg
          v-if="isConnecting(draggedConnection.uuid)"
          class="animate-spin text-muted-foreground size-3.5"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        ><circle
          class="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          stroke-width="4"
        /><path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        /></svg>
        <Database
          v-else-if="!isConnected(draggedConnection.uuid)"
          class="w-3.5 h-3.5 text-muted-foreground/70"
        />
        <Database
          v-else
          class="w-3.5 h-3.5 text-green-500"
        />
        <div
          v-if="isConnected(draggedConnection.uuid) && !isConnecting(draggedConnection.uuid)"
          class="absolute -bottom-0.5 -right-0.5 w-[6px] h-[6px] bg-green-500 rounded-full border border-background"
        />
      </div>
      <span class="truncate font-medium flex-1">{{ draggedConnection.name }}</span>
    </div>

    <!-- Hidden components handling dialog state -->
    <ConnectionDialog 
      v-model:open="showConnectionDialog" 
      :mode="currentDialogMode" 
      :connection="activeConnectionToEdit"
      :saving="connectionDialogSaving"
      :testing="connectionDialogTesting"
      :error-message="connectionDialogError"
      @save="onDialogSave"
      @test="onDialogTest"
    />
    
    <AppMenus
      ref="appMenusRef"
      class="hidden"
    />

    <Dialog v-model:open="showSshHostKeyDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ t('connection.confirmUnknownSshHostKeyTitle') }}</DialogTitle>
        </DialogHeader>
        <p class="py-4 text-sm text-muted-foreground">
          {{ sshHostKeyPromptMessage }}
        </p>
        <DialogFooter>
          <Button
            variant="outline"
            @click="resolveSshHostKeyPrompt(false)"
          >
            {{ t('connection.cancel') }}
          </Button>
          <Button @click="resolveSshHostKeyPrompt(true)">
            {{ t('connection.trustSshHost') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="showDeleteConnectionDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ t('connection.confirmDeleteTitle') }}</DialogTitle>
        </DialogHeader>
        <p class="py-4 text-sm text-muted-foreground">
          {{ deleteConnectionMessage }}
        </p>
        <DialogFooter>
          <Button
            variant="outline"
            :disabled="isDeletingConnection"
            @click="showDeleteConnectionDialog = false"
          >
            {{ t('connection.cancel') }}
          </Button>
          <Button
            variant="destructive"
            :disabled="isDeletingConnection"
            @click="deleteConnection"
          >
            {{ t('connection.delete') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style scoped>
.fade-in { animation: fadeIn 0.15s ease-out; }
</style>
