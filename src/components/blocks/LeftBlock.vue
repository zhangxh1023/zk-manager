<script setup lang="ts">
import { ref } from 'vue';
import { ChevronRight, ChevronDown, Settings, ClipboardClock, Database } from 'lucide-vue-next';
import ZkList from '../zkTree/ZkList.vue';
import { useConnectionsStore, type Connection } from '../../stores/connections';
import { useZnodeTabsStore } from '../../stores/znodeTabs';
import { zkApi } from '../../api/zk';
import { useLogsStore } from '../../stores/logs';
import { useI18n } from 'vue-i18n';
import { showToast } from '../../utils/toast';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '../ui/context-menu';
import ConnectionDialog from './ConnectionDialog.vue';
import AppMenus from '../appMenus/AppMenus.vue';

const { t } = useI18n();
const connectionsStore = useConnectionsStore();
const logsStore = useLogsStore();
const connectedSet = ref<Set<string>>(new Set());
const connectingSet = ref<Set<string>>(new Set());
const expandedSet = ref<Set<string>>(new Set());
const znodeTabsStore = useZnodeTabsStore();

// Connection Dialog State
const showConnectionDialog = ref(false);
const currentDialogMode = ref<'add' | 'edit'>('add');
const activeConnectionToEdit = ref<Connection | null>(null);

// Open AppMenus triggers
const appMenusRef = ref<InstanceType<typeof AppMenus> | null>(null);

const connect = async (conn: Connection) => {
  try {
    await zkApi.connect(
      conn.uuid,
      conn.url,
      conn.username,
      conn.password,
      conn.use_ssh,
      conn.ssh_host,
      conn.ssh_port,
      conn.ssh_username,
      conn.ssh_auth_method,
      conn.ssh_password,
      conn.ssh_key_path,
    );
    connectedSet.value.add(conn.uuid);
    expandedSet.value.add(conn.uuid);
    await logsStore.addLog(conn.name || conn.uuid, 'CONNECT', `Connected to ${conn.url}`, true);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Connection error:', errorMsg);
    await logsStore.addLog(conn.name || conn.uuid, 'CONNECT', `Failed to connect to ${conn.url}: ${errorMsg}`, false);
    throw err;
  }
};

const disconnect = async (conn: Connection) => {
  try {
    await zkApi.disconnect(conn.uuid);
  } catch (err) {
    console.error('Disconnect error:', err);
  }
  connectedSet.value.delete(conn.uuid);
  expandedSet.value.delete(conn.uuid);
  znodeTabsStore.closeTabsByConnection(conn.uuid);
  await logsStore.addLog(conn.name || conn.uuid, 'DISCONNECT', `Disconnected from ${conn.url}`);
};

const toggleConnection = async (conn: Connection) => {
  if (connectingSet.value.has(conn.uuid)) return;

  if (connectedSet.value.has(conn.uuid)) {
    // If already connected, just toggle expansion
    if (expandedSet.value.has(conn.uuid)) {
      expandedSet.value.delete(conn.uuid);
    } else {
      expandedSet.value.add(conn.uuid);
    }
  } else {
    connectingSet.value.add(conn.uuid);
    try {
      await connect(conn);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      showToast.error(`连接失败: ${errorMsg}`);
    } finally {
      connectingSet.value.delete(conn.uuid);
    }
  }
};

const isConnected = (uuid: string) => connectedSet.value.has(uuid);
const isConnecting = (uuid: string) => connectingSet.value.has(uuid);
const isExpanded = (uuid: string) => expandedSet.value.has(uuid);

const openAddDialog = () => {
  currentDialogMode.value = 'add';
  activeConnectionToEdit.value = null;
  showConnectionDialog.value = true;
};

const openEditDialog = (conn: Connection, event?: Event) => {
  if (event) event.stopPropagation();
  currentDialogMode.value = 'edit';
  activeConnectionToEdit.value = { ...conn };
  showConnectionDialog.value = true;
};

const deleteConnection = async (conn: Connection, event?: Event) => {
  if (event) event.stopPropagation();
  if (!window.confirm(t('connection.confirmDelete'))) return;

  if (connectedSet.value.has(conn.uuid)) {
    try { await zkApi.disconnect(conn.uuid); } catch { /* ignore */ }
  }
  connectedSet.value.delete(conn.uuid);
  expandedSet.value.delete(conn.uuid);
  znodeTabsStore.closeTabsByConnection(conn.uuid);
  
  await connectionsStore.removeConnection(conn.uuid);
  await logsStore.addLog(conn.name || conn.uuid, 'DELETE_CONNECTION', `Deleted connection ${conn.name}`);
};

const onDialogSave = async (connData: Omit<Connection, 'uuid'> & { uuid?: string }) => {
  if (currentDialogMode.value === 'add') {
    const { v4: uuidv4 } = await import('uuid');
    connData.uuid = uuidv4();
    await connectionsStore.addConnection(connData as Connection);
  } else {
    await connectionsStore.updateConnection(connData as Connection);
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
      <div class="h-12 border-b border-sidebar-border flex items-center px-4 justify-between shrink-0">
        <span class="text-xs font-semibold tracking-wider text-muted-foreground">CONNECTIONS</span>
      </div>
      
      <div class="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        <div
          v-for="conn in connectionsStore.connections"
          :key="conn.uuid"
          class="group"
        >
          <!-- Connection Name Header with Context Menu -->
          <ContextMenu>
            <ContextMenuTrigger>
              <div
                class="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-sidebar-accent transition-colors text-[13px]"
                @click="toggleConnection(conn)"
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
              <ContextMenuItem @click="openEditDialog(conn)">
                {{ t('connection.edit') }}
              </ContextMenuItem>
              <ContextMenuItem
                v-if="isConnected(conn.uuid)"
                @click="disconnect(conn)"
              >
                {{ t('connection.disconnect') }}
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem @click="deleteConnection(conn)">
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

    <!-- Hidden components handling dialog state -->
    <ConnectionDialog 
      v-model:open="showConnectionDialog" 
      :mode="currentDialogMode" 
      :connection="activeConnectionToEdit"
      @save="onDialogSave"
    />
    
    <AppMenus
      ref="appMenusRef"
      class="hidden"
    />
  </div>
</template>

<style scoped>
.fade-in { animation: fadeIn 0.15s ease-out; }
</style>
