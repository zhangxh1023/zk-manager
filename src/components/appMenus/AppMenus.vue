<script setup lang="ts">
import { ref, watch } from 'vue';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { useSettingsStore } from '../../stores/settings';
import { useLogsStore } from '../../stores/logs';
import i18n from '../../i18n';
import { showToast } from '../../utils/toast';

const { t } = i18n.global;

// Settings
const settingsStore = useSettingsStore();
const showSettings = ref(false);
// 标记是否是用户主动保存，用于区分保存和关闭
const isSaving = ref(false);
// 保存打开对话框时的原始设置，用于取消时恢复
const savedSettings = ref({ ...settingsStore.settings });

const VALID_SCALE_OPTIONS = [0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 2.0];

const openSettings = () => {
  // 保存当前设置，用于取消时回滚
  savedSettings.value = { ...settingsStore.settings };
  // 确保 scale 是有效值
  if (!VALID_SCALE_OPTIONS.includes(settingsStore.settings.scale)) {
    settingsStore.settings.scale = 1.0;
  }
  isSaving.value = false;
  showSettings.value = true;
};

const cancelSettings = () => {
  showSettings.value = false;
};

const saveSettings = async () => {
  // 标记为保存状态，防止 watch 回滚
  isSaving.value = true;
  // 持久化当前设置到数据库
  await settingsStore.save();
  // 更新 savedSettings 以便下次取消时能回滚到正确位置
  savedSettings.value = { ...settingsStore.settings };
  showSettings.value = false;
};

// 监听对话框关闭，如果不是主动保存则回滚设置
watch(showSettings, (newVal) => {
  if (!newVal && !isSaving.value) {
    // 对话框被关闭且不是保存操作，回滚设置
    settingsStore.settings.language = savedSettings.value.language;
    settingsStore.settings.theme = savedSettings.value.theme;
    settingsStore.settings.scale = savedSettings.value.scale;
  }
});

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

defineExpose({
  openSettings,
  openLogs,
});
</script>

<template>
  <div class="hidden">
    <!-- Settings Dialog -->
    <Dialog v-model:open="showSettings">
      <DialogContent class="max-w-sm">
        <DialogHeader class="pb-2">
          <DialogTitle>{{ t('settings.title') }}</DialogTitle>
        </DialogHeader>
        <div class="space-y-3">
          <div class="space-y-1.5">
            <Label
              for="lang"
              class="text-xs uppercase tracking-wider font-semibold text-muted-foreground"
            >{{ t('settings.language') }}</Label>
            <select
              id="lang"
              v-model="settingsStore.settings.language"
              class="flex h-8 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="en">
                English
              </option>
              <option value="zh">
                中文
              </option>
            </select>
          </div>
          <div class="space-y-1.5">
            <Label
              for="theme"
              class="text-xs uppercase tracking-wider font-semibold text-muted-foreground"
            >{{ t('settings.theme') }}</Label>
            <select
              id="theme"
              v-model="settingsStore.settings.theme"
              class="flex h-8 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="light">
                {{ t('settings.themes.light') }}
              </option>
              <option value="dark">
                {{ t('settings.themes.dark') }}
              </option>
              <option value="system">
                {{ t('settings.themes.system') }}
              </option>
            </select>
          </div>
          <div class="space-y-1.5">
            <Label
              for="scale"
              class="text-xs uppercase tracking-wider font-semibold text-muted-foreground"
            >{{ t('settings.scale') }}</Label>
            <select
              id="scale"
              v-model="settingsStore.settings.scale"
              class="flex h-8 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option :value="0.8">
                80%
              </option>
              <option :value="0.9">
                90%
              </option>
              <option :value="1.0">
                100%
              </option>
              <option :value="1.1">
                110%
              </option>
              <option :value="1.25">
                125%
              </option>
              <option :value="1.5">
                150%
              </option>
              <option :value="2.0">
                200%
              </option>
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