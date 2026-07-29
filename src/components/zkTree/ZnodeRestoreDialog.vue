<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { FileJson } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import {
  buildZnodeImportPlan,
  findZnodeImportConflicts,
  importZnodeSubtree,
  selectZnodeImportFile,
  type SelectedZnodeImportFile,
  type ZnodeImportConflictPolicy,
} from '../../composables/useZnodeImport';
import { confirmDialog } from '../../composables/useConfirmDialog';
import { useLogsStore } from '../../stores/logs';
import { useZkTreeStore } from '../../stores/zkTree';
import { getErrorMessage } from '../../utils/errors';
import { showToast } from '../../utils/toast';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

const props = defineProps<{
  connectionName?: string;
  connectionUuid: string;
  open: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void;
}>();

const { t } = useI18n();
const logsStore = useLogsStore();
const zkTreeStore = useZkTreeStore();

const selectedFile = ref<SelectedZnodeImportFile | null>(null);
const targetRootPath = ref('/');
const conflictPolicy = ref<ZnodeImportConflictPolicy>('skip');
const isSelectingFile = ref(false);
const isRestoring = ref(false);
const isBusy = computed(() => isSelectingFile.value || isRestoring.value);
const logConnectionName = computed(() => props.connectionName || props.connectionUuid);

const openModel = computed({
  get: () => props.open,
  set: (value) => {
    if (!value && isBusy.value) return;
    emit('update:open', value);
  },
});

const resetForm = () => {
  selectedFile.value = null;
  targetRootPath.value = '/';
  conflictPolicy.value = 'skip';
};

watch(
  () => [props.open, props.connectionUuid] as const,
  ([open]) => {
    if (open && !isBusy.value) {
      resetForm();
    }
  },
);

const chooseFile = async () => {
  if (isBusy.value) return;
  isSelectingFile.value = true;
  try {
    const nextFile = await selectZnodeImportFile();
    if (!nextFile) return;
    selectedFile.value = nextFile;
    targetRootPath.value = nextFile.exportFile.rootPath;
    conflictPolicy.value = 'skip';
  } catch (error) {
    selectedFile.value = null;
    showToast.error(`${t('backup.invalidFile')}: ${getErrorMessage(error)}`);
  } finally {
    isSelectingFile.value = false;
  }
};

const conflictPreview = (conflicts: string[]) => {
  const visiblePaths = conflicts.slice(0, 5).join('\n');
  const remainingCount = Math.max(0, conflicts.length - 5);
  return remainingCount > 0
    ? `${visiblePaths}\n${t('backup.moreConflicts', { count: remainingCount })}`
    : visiblePaths;
};

const restoreBackup = async () => {
  const importFile = selectedFile.value;
  if (!importFile || isBusy.value) return;

  isRestoring.value = true;
  try {
    const plan = buildZnodeImportPlan(importFile.exportFile, targetRootPath.value);
    const conflicts = await findZnodeImportConflicts(props.connectionUuid, plan);

    if (conflicts.length > 0) {
      const messageKey = conflictPolicy.value === 'overwrite'
        ? 'backup.overwriteConflictMessage'
        : 'backup.skipConflictMessage';
      const confirmed = await confirmDialog({
        title: t('backup.conflictTitle', { count: conflicts.length }),
        message: t(messageKey, {
          count: conflicts.length,
          paths: conflictPreview(conflicts),
        }),
        confirmText: t('backup.restoreAction'),
        variant: conflictPolicy.value === 'overwrite' ? 'destructive' : 'default',
      });
      if (!confirmed) return;
    }

    const result = await importZnodeSubtree({
      connectionUuid: props.connectionUuid,
      plan,
      conflictPolicy: conflictPolicy.value,
      existingPaths: conflicts,
    });

    await logsStore.addLog(
      logConnectionName.value,
      'IMPORT',
      `Restored ${importFile.filePath} to ${plan.targetRootPath}: `
      + `${result.createdCount} created, ${result.overwrittenCount} overwritten, `
      + `${result.skippedCount} skipped`,
    );
    await zkTreeStore.onNodeCreatedAtPath(props.connectionUuid, plan.targetRootPath, {
      invalidateAncestors: true,
      refreshCurrentPath: true,
    }).catch((refreshError) => {
      showToast.error(getErrorMessage(refreshError));
    });

    emit('update:open', false);
    showToast.success(t('backup.restoreSuccess', {
      created: result.createdCount,
      overwritten: result.overwrittenCount,
      skipped: result.skippedCount,
    }));
  } catch (error) {
    const message = getErrorMessage(error);
    await logsStore.addLog(
      logConnectionName.value,
      'IMPORT',
      `Failed to restore ${importFile.filePath}: ${message}`,
      false,
    );
    showToast.error(`${t('backup.restoreFailed')}: ${message}`);
  } finally {
    isRestoring.value = false;
  }
};
</script>

<template>
  <Dialog v-model:open="openModel">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ t('backup.restoreTitle') }}</DialogTitle>
        <p class="text-sm text-muted-foreground">
          {{ t('backup.restoreConnection', {
            name: connectionName || connectionUuid,
          }) }}
        </p>
      </DialogHeader>

      <div class="space-y-4 py-2">
        <div
          data-testid="restore-file-panel"
          class="rounded-md border border-dashed p-4"
        >
          <div class="flex items-center gap-3">
            <FileJson class="size-8 shrink-0 text-muted-foreground" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">
                {{ selectedFile?.fileName || t('backup.noFile') }}
              </p>
              <p
                v-if="selectedFile"
                data-testid="restore-file-summary"
                class="text-xs text-muted-foreground"
              >
                {{ t('backup.fileSummary', {
                  root: selectedFile.exportFile.rootPath,
                  count: selectedFile.exportFile.nodeCount,
                }) }}
              </p>
              <p
                v-else
                class="text-xs text-muted-foreground"
              >
                {{ t('backup.fileHint') }}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              :disabled="isBusy"
              data-testid="restore-choose-file"
              @click="chooseFile"
            >
              {{ isSelectingFile ? t('backup.selecting') : t('backup.chooseFile') }}
            </Button>
          </div>
        </div>

        <template v-if="selectedFile">
          <div>
            <Label
              for="restoreTargetRootPath"
              class="text-xs uppercase tracking-wider font-semibold text-muted-foreground"
            >
              {{ t('backup.targetRootPath') }}
            </Label>
            <Input
              id="restoreTargetRootPath"
              v-model="targetRootPath"
              data-testid="restore-target-path"
              :placeholder="t('backup.targetPlaceholder')"
              :disabled="isBusy"
              @keydown.enter.prevent="restoreBackup"
            />
            <p class="mt-1 text-xs text-muted-foreground">
              {{ t('backup.targetHint') }}
            </p>
          </div>

          <div>
            <Label
              for="restoreConflictPolicy"
              class="text-xs uppercase tracking-wider font-semibold text-muted-foreground"
            >
              {{ t('backup.conflictPolicy') }}
            </Label>
            <select
              id="restoreConflictPolicy"
              v-model="conflictPolicy"
              data-testid="restore-conflict-policy"
              :disabled="isBusy"
              class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="skip">
                {{ t('backup.keepExisting') }}
              </option>
              <option value="overwrite">
                {{ t('backup.overwriteExisting') }}
              </option>
            </select>
            <p
              class="mt-1 text-xs"
              :class="conflictPolicy === 'overwrite'
                ? 'text-destructive'
                : 'text-muted-foreground'"
            >
              {{ conflictPolicy === 'overwrite'
                ? t('backup.overwriteHint')
                : t('backup.keepExistingHint') }}
            </p>
          </div>

          <p class="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            {{ t('backup.metadataHint') }}
          </p>
        </template>
      </div>

      <DialogFooter>
        <Button
          variant="outline"
          :disabled="isBusy"
          @click="openModel = false"
        >
          {{ t('connection.cancel') }}
        </Button>
        <Button
          :variant="conflictPolicy === 'overwrite' ? 'destructive' : 'default'"
          :disabled="isBusy || !selectedFile"
          data-testid="restore-submit"
          @click="restoreBackup"
        >
          {{ isRestoring ? t('backup.restoring') : t('backup.restoreAction') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
