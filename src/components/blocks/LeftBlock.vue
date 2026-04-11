<script setup lang="ts">
import { ref } from 'vue';
import AppMenus from '../appMenus/AppMenus.vue';
import ZkList from '../zkTree/ZkList.vue';
import { useConnectionsStore } from '../../stores/connections';
import { zkApi } from '../../api/zk';
import { useLogsStore } from '../../stores/logs';
import { useI18n } from 'vue-i18n';
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
const editingConn = ref<{ uuid: string; name: string; url: string; username: string; password: string } | null>(null);

// Connect
const connect = async (conn: { uuid: string; url: string; username?: string; password?: string }) => {
  await zkApi.connect(conn.url, conn.username, conn.password);
  connectedSet.value.add(conn.uuid);
};

const toggleConnection = async (conn: { uuid: string; url: string; name?: string; username?: string; password?: string }) => {
  if (connectedSet.value.has(conn.uuid)) {
    connectedSet.value.delete(conn.uuid);
    await logsStore.addLog(conn.name || conn.uuid, 'DISCONNECT', `Disconnected from ${conn.url}`);
  } else {
    await connect(conn);
    await logsStore.addLog(conn.name || conn.uuid, 'CONNECT', `Connected to ${conn.url}`);
  }
};

const isConnected = (uuid: string) => connectedSet.value.has(uuid);

// Context menu handlers
const openEditDialog = (conn: { uuid: string; url: string; name?: string }, event: Event) => {
  event.stopPropagation();
  editingConn.value = { uuid: conn.uuid, name: conn.name || '', url: conn.url, username: '', password: '' };
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
    'UPDATE connections SET name = $1, url = $2 WHERE uuid = $3',
    [editingConn.value.name, editingConn.value.url, editingConn.value.uuid],
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
              class="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-accent/50 transition-colors"
              @click="toggleConnection(conn)"
            >
              <span class="text-xs text-muted-foreground">{{ isConnected(conn.uuid) ? '▼' : '▶' }}</span>
              <span class="text-sm font-medium truncate">{{ conn.name }}</span>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem @click="openEditDialog(conn, $event)">
              {{ t('connection.edit') }}
            </ContextMenuItem>
            <ContextMenuItem v-if="isConnected(conn.uuid)" @click="disconnect(conn, $event)">
              {{ t('connection.disconnect') }}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem @click="deleteConnection(conn, $event)">
              {{ t('connection.delete') }}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>

        <!-- Connected: show node list with path input -->
        <div v-if="isConnected(conn.uuid)" class="border-l-2 border-primary/30 ml-3">
          <ZkList
            :connection-uuid="conn.uuid"
            :connected="true"
          />
        </div>
      </div>
    </div>

    <!-- Edit Connection Dialog -->
    <Dialog v-model:open="showEditDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ t('connection.edit') }}</DialogTitle>
        </DialogHeader>
        <div v-if="editingConn" class="space-y-4 py-4">
          <div>
            <Label for="editName">{{ t('connection.name') }}</Label>
            <Input id="editName" v-model="editingConn.name" />
          </div>
          <div>
            <Label for="editUrl">{{ t('connection.url') }}</Label>
            <Input id="editUrl" v-model="editingConn.url" />
          </div>
          <div>
            <Label for="editUsername">{{ t('connection.username') }}</Label>
            <Input id="editUsername" v-model="editingConn.username" />
          </div>
          <div>
            <Label for="editPassword">{{ t('connection.password') }}</Label>
            <Input id="editPassword" v-model="editingConn.password" type="password" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showEditDialog = false">{{ t('connection.cancel') }}</Button>
          <Button @click="saveEdit">{{ t('connection.save') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
