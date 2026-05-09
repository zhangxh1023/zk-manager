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
import { getErrorMessage } from '../../utils/errors';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '../ui/context-menu';
import ConnectionDialog from './ConnectionDialog.vue';
import AppMenus from '../appMenus/AppMenus.vue';

const { t } = useI18n();
const connectionsStore = useConnectionsStore();
const logsStore = useLogsStore();
const znodeTabsStore = useZnodeTabsStore();

// Connection Dialog State
const showConnectionDialog = ref(false);
const currentDialogMode = ref<'add' | 'edit'>('add');
const activeConnectionToEdit = ref<Connection | null>(null);
const connectionDialogSaving = ref(false);
const connectionDialogTesting = ref(false);
const connectionDialogError = ref('');

// Open AppMenus triggers
const appMenusRef = ref<InstanceType<typeof AppMenus> | null>(null);

const disconnect = async (conn: Connection) => {
  if (
    znodeTabsStore.hasDirtyTabsByConnection(conn.uuid)
    && !window.confirm(t('tabs.confirmDisconnectDirty'))
  ) {
    return;
  }
  await connectionsStore.disconnectConnection(conn);
  znodeTabsStore.closeTabsByConnection(conn.uuid);
};

const toggleConnection = async (conn: Connection) => {
  try {
    await connectionsStore.toggleConnection(conn);
  } catch (err) {
    const errorMsg = getErrorMessage(err);
    showToast.error(`连接失败: ${errorMsg}`);
  }
};

const isConnected = connectionsStore.isConnected;
const isConnecting = connectionsStore.isConnecting;
const isExpanded = connectionsStore.isExpanded;

const openAddDialog = () => {
  currentDialogMode.value = 'add';
  activeConnectionToEdit.value = null;
  connectionDialogError.value = '';
  showConnectionDialog.value = true;
};

const openEditDialog = async (conn: Connection, event?: Event) => {
  if (event) event.stopPropagation();
  currentDialogMode.value = 'edit';
  connectionDialogError.value = '';
  const secrets = await connectionsStore.loadConnectionSecrets(conn.uuid);
  activeConnectionToEdit.value = { ...conn, ...secrets };
  showConnectionDialog.value = true;
};

const deleteConnection = async (conn: Connection, event?: Event) => {
  if (event) event.stopPropagation();
  if (!window.confirm(t('connection.confirmDelete'))) return;
  if (
    znodeTabsStore.hasDirtyTabsByConnection(conn.uuid)
    && !window.confirm(t('tabs.confirmDisconnectDirty'))
  ) {
    return;
  }

  if (connectionsStore.isConnected(conn.uuid)) {
    await connectionsStore.disconnectConnection(conn);
  }
  connectionsStore.forgetConnectionState(conn.uuid);
  znodeTabsStore.closeTabsByConnection(conn.uuid);
  
  await connectionsStore.removeConnection(conn.uuid);
  await logsStore.addLog(conn.name || conn.uuid, 'DELETE_CONNECTION', `Deleted connection ${conn.name}`);
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
    );
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
  </div>
</template>

<style scoped>
.fade-in { animation: fadeIn 0.15s ease-out; }
</style>
