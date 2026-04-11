<script setup lang="ts">
import { ref } from 'vue';
import { CirclePlus, Settings, ClipboardClock } from 'lucide-vue-next';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { getDb } from '../../db/db';
import { v4 as uuidv4 } from 'uuid';
import { useConnectionsStore } from '../../stores/connections';
import { useSettingsStore } from '../../stores/settings';
import { useLogsStore } from '../../stores/logs';
import i18n from '../../i18n';
import { showToast } from '../../utils/toast';

const { t } = i18n.global;

// New connection dialog
const showNewConn = ref(false);
const urlRef = ref('');
const nameRef = ref('');
const usernameRef = ref('');
const passwordRef = ref('');

const connectionsStore = useConnectionsStore();

const saveConnection = async () => {
  if (!urlRef.value || !nameRef.value) return;
  const db = await getDb();
  await db.execute(
    'INSERT INTO connections (uuid, url, name, username, password) VALUES ($1, $2, $3, $4, $5)',
    [uuidv4(), urlRef.value, nameRef.value, usernameRef.value || null, passwordRef.value || null],
  );
  urlRef.value = '';
  nameRef.value = '';
  usernameRef.value = '';
  passwordRef.value = '';
  showNewConn.value = false;
  await connectionsStore.reloadConnections();
};

// Settings - preview on change
const settingsStore = useSettingsStore();
const showSettings = ref(false);
// 保存打开对话框时的原始设置，用于取消时恢复
const savedSettings = ref({ ...settingsStore.settings });
// 表单绑定的临时副本
const tempSettings = ref({ ...settingsStore.settings });

const openSettings = () => {
  // 保存当前设置
  savedSettings.value = { ...settingsStore.settings };
  // 初始化表单副本
  tempSettings.value = { ...settingsStore.settings };
  showSettings.value = true;
};

const onTempSettingChange = () => {
  // 实时预览：把表单值应用到全局
  settingsStore.settings.language = tempSettings.value.language;
  settingsStore.settings.theme = tempSettings.value.theme;
  settingsStore.settings.fontSize = tempSettings.value.fontSize;
  i18n.global.locale.value = tempSettings.value.language;
};

const cancelSettings = () => {
  // 恢复原始设置（打开对话框时的值）
  settingsStore.settings.language = savedSettings.value.language;
  settingsStore.settings.theme = savedSettings.value.theme;
  settingsStore.settings.fontSize = savedSettings.value.fontSize;
  i18n.global.locale.value = savedSettings.value.language;
  showSettings.value = false;
};

const saveSettings = async () => {
  // 设置已经在 onTempSettingChange 时应用了，这里只保存到数据库
  await settingsStore.save();
  showSettings.value = false;
};

// Logs
const logsStore = useLogsStore();
const showLogs = ref(false);

const formatTime = (timestamp: number) => {
  return new Date(timestamp).toLocaleString();
};

const openLogs = () => {
  showLogs.value = true;
  logsStore.loadLogs(1);
};

const prevPage = () => {
  if (logsStore.hasPrevPage()) {
    logsStore.loadLogs(logsStore.currentPage - 1);
  }
};

const nextPage = () => {
  if (logsStore.hasNextPage()) {
    logsStore.loadLogs(logsStore.currentPage + 1);
  }
};

const clearLogs = async () => {
  await logsStore.clearLogs();
  showToast.success(t('logs.cleared') || 'Logs cleared');
};
</script>

<template>
  <div class="flex border-b">
    <!-- New Connection -->
    <Dialog v-model:open="showNewConn">
      <DialogTrigger as-child>
        <Button
          variant="ghost"
          size="sm"
          class="cursor-pointer"
        >
          <CirclePlus />
          {{ t('app.newConnection') }}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ t('app.newConnection') }}</DialogTitle>
        </DialogHeader>
        <div class="grid gap-4 py-4">
          <div class="grid gap-3">
            <Label for="name">{{ t('connection.name') }}</Label>
            <Input id="name" v-model="nameRef" :placeholder="t('connection.name')" />
          </div>
          <div class="grid gap-3">
            <Label for="url">{{ t('connection.url') }}</Label>
            <Input id="url" v-model="urlRef" placeholder="localhost:2181" />
          </div>
          <div class="grid gap-3">
            <Label for="username">{{ t('connection.username') }}</Label>
            <Input id="username" v-model="usernameRef" />
          </div>
          <div class="grid gap-3">
            <Label for="password">{{ t('connection.password') }}</Label>
            <Input id="password" v-model="passwordRef" type="password" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showNewConn = false">{{ t('connection.cancel') }}</Button>
          <Button @click="saveConnection">{{ t('connection.save') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Settings -->
    <Dialog v-model:open="showSettings">
      <DialogTrigger as-child>
        <Button
          variant="ghost"
          size="sm"
          class="cursor-pointer"
          @click="openSettings"
        >
          <Settings />
          {{ t('app.settings') }}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ t('settings.title') }}</DialogTitle>
        </DialogHeader>
        <div class="grid gap-4 py-4">
          <div class="grid gap-3">
            <Label for="lang">{{ t('settings.language') }}</Label>
            <select
              id="lang"
              v-model="tempSettings.language"
              @change="onTempSettingChange"
              class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              <option value="en">English</option>
              <option value="zh">中文</option>
            </select>
          </div>
          <div class="grid gap-3">
            <Label for="theme">{{ t('settings.theme') }}</Label>
            <select
              id="theme"
              v-model="tempSettings.theme"
              @change="onTempSettingChange"
              class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              <option value="light">{{ t('settings.themes.light') }}</option>
              <option value="dark">{{ t('settings.themes.dark') }}</option>
              <option value="system">{{ t('settings.themes.system') }}</option>
            </select>
          </div>
          <div class="grid gap-3">
            <Label for="fontSize">{{ t('settings.fontSize') }}</Label>
            <Input
              id="fontSize"
              v-model="tempSettings.fontSize"
              @change="onTempSettingChange"
              type="number"
              min="10"
              max="24"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="cancelSettings">{{ t('connection.cancel') }}</Button>
          <Button @click="saveSettings">{{ t('connection.save') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Logs -->
    <Dialog v-model:open="showLogs">
      <DialogTrigger as-child>
        <Button
          variant="ghost"
          size="sm"
          class="cursor-pointer"
          @click="openLogs"
        >
          <ClipboardClock />
          {{ t('app.logs') }}
        </Button>
      </DialogTrigger>
      <DialogContent class="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{{ t('logs.title') }}</DialogTitle>
        </DialogHeader>
        <div class="flex-1 overflow-auto py-4">
          <div v-if="logsStore.logs.length === 0" class="text-muted-foreground text-sm text-center py-8">
            {{ t('logs.noLogs') }}
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="log in logsStore.logs"
              :key="log.id"
              class="border rounded p-2 text-sm font-mono"
            >
              <div class="flex justify-between text-xs text-muted-foreground mb-1">
                <span>{{ formatTime(log.timestamp) }}</span>
                <span>{{ log.connectionName }}</span>
              </div>
              <div class="text-xs">{{ log.command }}</div>
              <div class="mt-1">{{ log.details }}</div>
            </div>
          </div>
        </div>
        <!-- Pagination & Actions -->
        <DialogFooter class="flex justify-between">
          <div class="flex gap-2">
            <Button variant="outline" size="sm" @click="prevPage" :disabled="!logsStore.hasPrevPage()">上一页</Button>
            <Button variant="outline" size="sm" @click="nextPage" :disabled="!logsStore.hasNextPage()">下一页</Button>
            <span class="text-sm text-muted-foreground self-center">
              {{ logsStore.currentPage }} / {{ logsStore.totalPages() }}
            </span>
          </div>
          <div class="flex gap-2">
            <Button variant="destructive" size="sm" @click="clearLogs">{{ t('logs.clear') }}</Button>
            <Button variant="outline" size="sm" @click="showLogs = false">{{ t('logs.close') }}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>