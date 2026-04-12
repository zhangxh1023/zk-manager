<script setup lang="ts">
import { ref } from 'vue';
import { CirclePlus, Settings, ClipboardClock } from 'lucide-vue-next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
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

// Settings
const settingsStore = useSettingsStore();
const showSettings = ref(false);
// 保存打开对话框时的原始设置，用于取消时恢复
const savedSettings = ref({ ...settingsStore.settings });
// 表单绑定的临时副本
const tempSettings = ref({ ...settingsStore.settings });

const VALID_SCALE_OPTIONS = [0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 2.0];

const openSettings = () => {
  // 保存当前设置
  savedSettings.value = { ...settingsStore.settings };
  // 初始化表单副本，确保 scale 是有效值
  const currentScale = settingsStore.settings.scale;
  tempSettings.value = {
    ...settingsStore.settings,
    scale: VALID_SCALE_OPTIONS.includes(currentScale) ? currentScale : 1.0,
  };
  showSettings.value = true;
};

const cancelSettings = () => {
  // 恢复原始设置（取消时不做任何应用）
  settingsStore.settings.language = savedSettings.value.language;
  settingsStore.settings.theme = savedSettings.value.theme;
  settingsStore.settings.scale = savedSettings.value.scale;
  settingsStore.applyScale();
  i18n.global.locale.value = savedSettings.value.language;
  showSettings.value = false;
};

const saveSettings = async () => {
  // 应用所有设置
  settingsStore.settings.language = tempSettings.value.language;
  settingsStore.settings.theme = tempSettings.value.theme;
  settingsStore.settings.scale = tempSettings.value.scale;
  settingsStore.applyScale();
  i18n.global.locale.value = tempSettings.value.language;
  await settingsStore.save();
  // 更新savedSettings以便下次取消时能回滚到正确位置
  savedSettings.value = { ...settingsStore.settings };
  showSettings.value = false;
};

// Logs
const logsStore = useLogsStore();
const showLogs = ref(false);
const showClearConfirm = ref(false);

const formatTime = (timestamp: number) => {
  const d = new Date(timestamp);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
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

const confirmClearLogs = () => {
  showClearConfirm.value = true;
};

const clearLogs = async () => {
  await logsStore.clearLogs();
  showClearConfirm.value = false;
  showToast.success(t('logs.cleared') || 'Logs cleared');
};
</script>

<template>
  <div class="flex items-center gap-1 px-2 border-b">
    <!-- New Connection -->
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="icon"
            class="cursor-pointer"
            @click="showNewConn = true"
          >
            <CirclePlus class="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{{ t('app.newConnection') }}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>

    <!-- Settings -->
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="icon"
            class="cursor-pointer"
            @click="openSettings"
          >
            <Settings class="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{{ t('app.settings') }}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>

    <!-- Logs -->
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="icon"
            class="cursor-pointer"
            @click="openLogs"
          >
            <ClipboardClock class="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{{ t('app.logs') }}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>

    <!-- New Connection Dialog -->
    <Dialog v-model:open="showNewConn">
      <DialogContent class="max-w-md">
        <DialogHeader class="pb-2">
          <DialogTitle>{{ t('app.newConnection') }}</DialogTitle>
        </DialogHeader>
        <div class="space-y-3">
          <div class="space-y-1.5">
            <Label for="name" class="text-xs">{{ t('connection.name') }}</Label>
            <Input
              id="name"
              v-model="nameRef"
              :placeholder="t('connection.name')"
              class="h-8"
            />
          </div>
          <div class="space-y-1.5">
            <Label for="url" class="text-xs">{{ t('connection.url') }}</Label>
            <Input
              id="url"
              v-model="urlRef"
              placeholder="localhost:2181"
              class="h-8"
            />
          </div>
          <div class="space-y-1.5">
            <Label for="username" class="text-xs">{{ t('connection.username') }}</Label>
            <Input
              id="username"
              v-model="usernameRef"
              class="h-8"
            />
          </div>
          <div class="space-y-1.5">
            <Label for="password" class="text-xs">{{ t('connection.password') }}</Label>
            <Input
              id="password"
              v-model="passwordRef"
              type="password"
              class="h-8"
            />
          </div>
        </div>
        <DialogFooter class="pt-4">
          <Button
            variant="outline"
            size="sm"
            @click="showNewConn = false"
          >
            {{ t('connection.cancel') }}
          </Button>
          <Button
            size="sm"
            @click="saveConnection"
          >
            {{ t('connection.save') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Settings Dialog -->
    <Dialog v-model:open="showSettings">
      <DialogContent class="max-w-sm">
        <DialogHeader class="pb-2">
          <DialogTitle>{{ t('settings.title') }}</DialogTitle>
        </DialogHeader>
        <div class="space-y-3">
          <div class="space-y-1.5">
            <Label for="lang" class="text-xs">{{ t('settings.language') }}</Label>
            <select
              id="lang"
              v-model="tempSettings.language"
              class="flex h-8 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="en">English</option>
              <option value="zh">中文</option>
            </select>
          </div>
          <div class="space-y-1.5">
            <Label for="theme" class="text-xs">{{ t('settings.theme') }}</Label>
            <select
              id="theme"
              v-model="tempSettings.theme"
              class="flex h-8 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="light">{{ t('settings.themes.light') }}</option>
              <option value="dark">{{ t('settings.themes.dark') }}</option>
              <option value="system">{{ t('settings.themes.system') }}</option>
            </select>
          </div>
          <div class="space-y-1.5">
            <Label for="scale" class="text-xs">{{ t('settings.scale') }}</Label>
            <select
              id="scale"
              v-model="tempSettings.scale"
              class="flex h-8 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option :value="0.8">80%</option>
              <option :value="0.9">90%</option>
              <option :value="1.0">100%</option>
              <option :value="1.1">110%</option>
              <option :value="1.25">125%</option>
              <option :value="1.5">150%</option>
              <option :value="2.0">200%</option>
            </select>
          </div>
        </div>
        <DialogFooter class="pt-4">
          <Button
            variant="outline"
            size="sm"
            @click="cancelSettings"
          >
            {{ t('connection.cancel') }}
          </Button>
          <Button
            size="sm"
            @click="saveSettings"
          >
            {{ t('connection.save') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Logs Dialog -->
    <Dialog v-model:open="showLogs">
      <DialogContent class="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{{ t('logs.title') }}</DialogTitle>
        </DialogHeader>
        <div class="flex-1 overflow-hidden flex flex-col">
          <div
            v-if="logsStore.logs.length === 0"
            class="text-muted-foreground text-sm text-center py-8"
          >
            {{ t('logs.noLogs') }}
          </div>
          <div
            v-else
            class="flex-1 overflow-auto"
          >
            <!-- Rows -->
            <div
              v-for="log in logsStore.logs"
              :key="log.id"
              class="px-3 py-2 text-xs border-b hover:bg-muted/50 font-mono"
              :class="log.success ? 'text-foreground' : 'text-destructive'"
            >
              <span class="text-muted-foreground">{{ formatTime(log.timestamp) }}</span>
              <span :class="log.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
                {{ log.success ? ' ✓' : ' ✗' }}
              </span>
              <span class="ml-1">{{ log.command }}:</span>
              <span class="ml-1">{{ log.details }}</span>
            </div>
          </div>
        </div>
        <!-- Pagination & Actions -->
        <DialogFooter class="flex justify-between">
          <div class="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              :disabled="!logsStore.hasPrevPage()"
              @click="prevPage"
            >
              {{ t('logs.prevPage') }}
            </Button>
            <Button
              variant="outline"
              size="sm"
              :disabled="!logsStore.hasNextPage()"
              @click="nextPage"
            >
              {{ t('logs.nextPage') }}
            </Button>
            <span class="text-sm text-muted-foreground self-center">
              {{ logsStore.currentPage }} / {{ logsStore.totalPages() }}
            </span>
          </div>
          <div class="flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              @click="confirmClearLogs"
            >
              {{ t('logs.clear') }}
            </Button>
            <Button
              variant="outline"
              size="sm"
              @click="showLogs = false"
            >
              {{ t('logs.close') }}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      <!-- Clear Confirm Dialog -->
      <Dialog v-model:open="showClearConfirm">
        <DialogContent class="max-w-sm">
          <DialogHeader>
            <DialogTitle>{{ t('logs.clear') }}</DialogTitle>
          </DialogHeader>
          <div class="py-4">
            <p class="text-sm text-muted-foreground">
              {{ t('logs.confirmClear') }}
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              @click="showClearConfirm = false"
            >
              {{ t('connection.cancel') }}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              @click="clearLogs"
            >
              {{ t('logs.clear') }}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  </div>
</template>