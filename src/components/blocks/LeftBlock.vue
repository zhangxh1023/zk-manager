<script setup lang="ts">
import { ref } from 'vue';
import { ChevronRight, ChevronDown } from 'lucide-vue-next';
import AppMenus from '../appMenus/AppMenus.vue';
import ZkList from '../zkTree/ZkList.vue';
import { useConnectionsStore } from '../../stores/connections';
import { zkApi } from '../../api/zk';
import { useLogsStore } from '../../stores/logs';
import { useI18n } from 'vue-i18n';
import { showToast } from '../../utils/toast';
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

const { t } = useI18n();
const connectionsStore = useConnectionsStore();
const logsStore = useLogsStore();

const connectedSet = ref<Set<string>>(new Set());

// Edit dialog
const showEditDialog = ref(false);
const editingConn = ref<{
  uuid: string;
  name: string;
  url: string;
  username: string;
  password: string;
  use_ssh: boolean;
  ssh_host: string;
  ssh_port: number;
  ssh_username: string;
  ssh_auth_method: string;
  ssh_password: string;
  ssh_key_path: string;
} | null>(null);

// Connect
const connect = async (conn: {
  uuid: string;
  url: string;
  name?: string;
  username?: string;
  password?: string;
  use_ssh?: boolean;
  ssh_host?: string;
  ssh_port?: number;
  ssh_username?: string;
  ssh_auth_method?: string;
  ssh_password?: string;
  ssh_key_path?: string;
}) => {
  console.log('connect called with:', {
    url: conn.url,
    use_ssh: conn.use_ssh,
    ssh_host: conn.ssh_host,
  });

  try {
    await zkApi.connect(
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
    await logsStore.addLog(conn.name || conn.uuid, 'CONNECT', `Connected to ${conn.url}`, true);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Connection error:', errorMsg);
    await logsStore.addLog(conn.name || conn.uuid, 'CONNECT', `Failed to connect to ${conn.url}: ${errorMsg}`, false);
    throw err; // Re-throw so toggleConnection knows it failed
  }
};

const toggleConnection = async (conn: {
  uuid: string;
  url: string;
  name?: string;
  username?: string;
  password?: string;
  use_ssh?: boolean;
  ssh_host?: string;
  ssh_port?: number;
  ssh_username?: string;
  ssh_auth_method?: string;
  ssh_password?: string;
  ssh_key_path?: string;
}) => {
  console.log('toggleConnection called for:', conn.name || conn.uuid, 'use_ssh:', conn.use_ssh);

  if (connectedSet.value.has(conn.uuid)) {
    connectedSet.value.delete(conn.uuid);
    await logsStore.addLog(conn.name || conn.uuid, 'DISCONNECT', `Disconnected from ${conn.url}`);
  } else {
    try {
      await connect(conn);
    } catch (err) {
      // Connection failed, already logged in connect()
      console.log('Connection failed, error was caught');
      // Show error toast
      const errorMsg = err instanceof Error ? err.message : String(err);
      showToast.error(`连接失败: ${errorMsg}`);
    }
  }
};

const isConnected = (uuid: string) => connectedSet.value.has(uuid);

// Context menu handlers
const openEditDialog = (conn: {
  uuid: string;
  url: string;
  name?: string;
  username?: string;
  password?: string;
  use_ssh?: boolean;
  ssh_host?: string;
  ssh_port?: number;
  ssh_username?: string;
  ssh_auth_method?: string;
  ssh_password?: string;
  ssh_key_path?: string;
}, event: Event) => {
  event.stopPropagation();
  editingConn.value = {
    uuid: conn.uuid,
    name: conn.name || '',
    url: conn.url,
    username: conn.username || '',
    password: conn.password || '',
    use_ssh: conn.use_ssh || false,
    ssh_host: conn.ssh_host || '',
    ssh_port: conn.ssh_port || 22,
    ssh_username: conn.ssh_username || '',
    ssh_auth_method: conn.ssh_auth_method || 'password',
    ssh_password: conn.ssh_password || '',
    ssh_key_path: conn.ssh_key_path || '',
  };
  showEditDialog.value = true;
};

const disconnect = async (conn: { uuid: string; url: string; name?: string }, event: Event) => {
  event.stopPropagation();
  connectedSet.value.delete(conn.uuid);
  await logsStore.addLog(conn.name || conn.uuid, 'DISCONNECT', `Disconnected from ${conn.url}`);
};

const saveEdit = async () => {
  if (!editingConn.value) return;
  const db = await getDb();
  await db.execute(
    `UPDATE connections SET
      name = $1,
      url = $2,
      username = $3,
      password = $4,
      use_ssh = $5,
      ssh_host = $6,
      ssh_port = $7,
      ssh_username = $8,
      ssh_auth_method = $9,
      ssh_password = $10,
      ssh_key_path = $11
    WHERE uuid = $12`,
    [
      editingConn.value.name,
      editingConn.value.url,
      editingConn.value.username || null,
      editingConn.value.password || null,
      editingConn.value.use_ssh ? 1 : 0,
      editingConn.value.use_ssh ? editingConn.value.ssh_host : null,
      editingConn.value.use_ssh ? editingConn.value.ssh_port : null,
      editingConn.value.use_ssh ? editingConn.value.ssh_username : null,
      editingConn.value.use_ssh ? editingConn.value.ssh_auth_method : null,
      editingConn.value.use_ssh && editingConn.value.ssh_auth_method === 'password' ? editingConn.value.ssh_password : null,
      editingConn.value.use_ssh && editingConn.value.ssh_auth_method === 'key' ? editingConn.value.ssh_key_path : null,
      editingConn.value.uuid,
    ],
  );
  await logsStore.addLog(editingConn.value.name, 'UPDATE_CONNECTION', `Updated connection ${editingConn.value.name}`);
  await connectionsStore.reloadConnections();
  showEditDialog.value = false;
};

const deleteConnection = async (conn: { uuid: string; url: string; name?: string }, event: Event) => {
  event.stopPropagation();
  if (!window.confirm(t('connection.confirmDelete'))) return;
  connectedSet.value.delete(conn.uuid);
  const db = await getDb();
  await db.execute('DELETE FROM connections WHERE uuid = $1', [conn.uuid]);
  await logsStore.addLog(conn.name || conn.uuid, 'DELETE_CONNECTION', `Deleted connection ${conn.name}`);
  await connectionsStore.reloadConnections();
};

import { getDb } from '../../db/db';
</script>

<template>
  <div class="flex flex-col h-full">
    <AppMenus />
    <div class="flex-1 overflow-auto">
      <div
        v-for="conn in connectionsStore.connections"
        :key="conn.uuid"
      >
        <!-- Connection Header -->
        <ContextMenu>
          <ContextMenuTrigger>
            <div
              class="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-accent/50 transition-colors text-xs"
              @click="toggleConnection(conn)"
            >
              <component
                :is="isConnected(conn.uuid) ? ChevronDown : ChevronRight"
                class="w-3 h-3 text-muted-foreground shrink-0"
              />
              <span class="truncate text-muted-foreground">{{ conn.name }}</span>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem @click="openEditDialog(conn, $event)">
              {{ t('connection.edit') }}
            </ContextMenuItem>
            <ContextMenuItem
              v-if="isConnected(conn.uuid)"
              @click="disconnect(conn, $event)"
            >
              {{ t('connection.disconnect') }}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem @click="deleteConnection(conn, $event)">
              {{ t('connection.delete') }}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>

        <!-- Connected: show node list with path input -->
        <div
          v-if="isConnected(conn.uuid)"
          class="border-l-2 border-primary/30 ml-3"
        >
          <ZkList
            :connection-uuid="conn.uuid"
            :connected="true"
          />
        </div>
      </div>
    </div>

    <!-- Edit Connection Dialog -->
    <Dialog v-model:open="showEditDialog">
      <DialogContent class="max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader class="shrink-0">
          <DialogTitle>{{ t('connection.edit') }}</DialogTitle>
        </DialogHeader>
        <div
          v-if="editingConn"
          class="flex-1 overflow-y-auto space-y-4 py-4"
        >
          <div>
            <Label for="editName">{{ t('connection.name') }}</Label>
            <Input
              id="editName"
              v-model="editingConn.name"
            />
          </div>
          <div>
            <Label for="editUrl">{{ t('connection.url') }}</Label>
            <Input
              id="editUrl"
              v-model="editingConn.url"
            />
          </div>
          <div>
            <Label for="editUsername">{{ t('connection.username') }}</Label>
            <Input
              id="editUsername"
              v-model="editingConn.username"
            />
          </div>
          <div>
            <Label for="editPassword">{{ t('connection.password') }}</Label>
            <Input
              id="editPassword"
              v-model="editingConn.password"
              type="password"
            />
          </div>

          <!-- SSH Tunnel Section -->
          <div class="border-t pt-4">
            <div class="flex items-center gap-2 mb-3">
              <input
                id="editUseSsh"
                v-model="editingConn.use_ssh"
                type="checkbox"
                class="w-4 h-4 rounded border-input"
              >
              <Label for="editUseSsh" class="text-xs font-medium">{{ t('connection.useSsh') }}</Label>
            </div>

            <div v-if="editingConn.use_ssh" class="space-y-3 pl-6">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <Label for="editSshHost" class="text-xs">{{ t('connection.sshHost') }}</Label>
                  <Input
                    id="editSshHost"
                    v-model="editingConn.ssh_host"
                    class="h-8"
                  />
                </div>
                <div>
                  <Label for="editSshPort" class="text-xs">{{ t('connection.sshPort') }}</Label>
                  <Input
                    id="editSshPort"
                    v-model="editingConn.ssh_port"
                    type="number"
                    class="h-8"
                  />
                </div>
              </div>
              <div>
                <Label for="editSshUsername" class="text-xs">{{ t('connection.sshUsername') }}</Label>
                <Input
                  id="editSshUsername"
                  v-model="editingConn.ssh_username"
                  class="h-8"
                />
              </div>
              <div>
                <Label class="text-xs">{{ t('connection.sshAuthMethod') }}</Label>
                <div class="flex gap-4 mt-1">
                  <label class="flex items-center gap-1.5 text-xs">
                    <input
                      v-model="editingConn.ssh_auth_method"
                      type="radio"
                      value="password"
                      class="w-3.5 h-3.5"
                    >
                    {{ t('connection.sshPassword') }}
                  </label>
                  <label class="flex items-center gap-1.5 text-xs">
                    <input
                      v-model="editingConn.ssh_auth_method"
                      type="radio"
                      value="key"
                      class="w-3.5 h-3.5"
                    >
                    {{ t('connection.sshKey') }}
                  </label>
                </div>
              </div>
              <div v-if="editingConn.ssh_auth_method === 'password'">
                <Label for="editSshPassword" class="text-xs">{{ t('connection.sshPassword') }}</Label>
                <Input
                  id="editSshPassword"
                  v-model="editingConn.ssh_password"
                  type="password"
                  class="h-8"
                />
              </div>
              <div v-else>
                <Label for="editSshKeyPath" class="text-xs">{{ t('connection.sshKeyPath') }}</Label>
                <Input
                  id="editSshKeyPath"
                  v-model="editingConn.ssh_key_path"
                  placeholder="~/.ssh/id_rsa"
                  class="h-8"
                />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter class="shrink-0">
          <Button
            variant="outline"
            @click="showEditDialog = false"
          >
            {{ t('connection.cancel') }}
          </Button>
          <Button @click="saveEdit">
            {{ t('connection.save') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
