import { computed, ref, watch, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { zkApi } from '../../../api/zk';
import { confirmDialog } from '../../../composables/useConfirmDialog';
import { useLogsStore } from '../../../stores/logs';
import { useZnodeTabsStore, type ZnodeTab } from '../../../stores/znodeTabs';
import { getErrorMessage } from '../../../utils/errors';
import {
  formatBytes,
  formatStructuredText,
  parseBytes,
  type SerializationFormat,
} from '../../../utils/serializer';
import { showToast } from '../../../utils/toast';
import { FORMAT_OPTIONS } from '../utils';

export const useDataEditor = (tab: Ref<ZnodeTab>) => {
  const { t } = useI18n();
  const znodeTabsStore = useZnodeTabsStore();
  const logsStore = useLogsStore();

  const dataFormat = ref<SerializationFormat>('text');
  const editValue = ref('');
  const isSubmitting = ref(false);
  const errorMessage = ref('');
  const originalValue = ref<string | null>(null);
  const isDirty = computed(() =>
    originalValue.value !== null && editValue.value !== originalValue.value,
  );

  const hasUnsavedChanges = () => isDirty.value;

  const syncEditValue = () => {
    const result = formatBytes(tab.value.znodeData, dataFormat.value);
    if (result.success && result.data !== undefined) {
      editValue.value = result.data;
      originalValue.value = result.data;
      errorMessage.value = '';
    } else {
      errorMessage.value = result.error || 'Failed to format data';
    }
  };

  watch(() => tab.value.znodeData, syncEditValue, { immediate: true });

  let revertingFormat = false;
  watch(dataFormat, async (_, oldFormat) => {
    if (revertingFormat) {
      revertingFormat = false;
      return;
    }

    if (hasUnsavedChanges() && !(await confirmDialog(t('tabs.confirmFormatDirty')))) {
      revertingFormat = true;
      dataFormat.value = oldFormat;
      return;
    }

    syncEditValue();
  });

  watch(editValue, (newVal) => {
    if (originalValue.value !== null) {
      znodeTabsStore.setDirty(
        tab.value.connectionUuid,
        tab.value.path,
        newVal !== originalValue.value,
      );
    }
  });

  watch(() => tab.value.path, syncEditValue);

  const format = () => {
    if (dataFormat.value !== 'json' && dataFormat.value !== 'xml') return;

    errorMessage.value = '';
    const result = formatStructuredText(editValue.value, dataFormat.value);
    if (!result.success || result.data === undefined) {
      errorMessage.value = result.error || 'Failed to format data';
      return;
    }

    editValue.value = result.data;
  };

  const save = async () => {
    isSubmitting.value = true;
    errorMessage.value = '';
    try {
      const result = parseBytes(editValue.value, dataFormat.value);
      if (!result.success || !result.bytes) {
        errorMessage.value = result.error || 'Failed to parse data';
        isSubmitting.value = false;
        return;
      }

      if (!tab.value.stat) {
        throw new Error(t('node.refreshBeforeSave'));
      }

      const details = await zkApi.setData(
        tab.value.connectionUuid,
        tab.value.path,
        result.bytes,
        tab.value.stat.version,
      );
      znodeTabsStore.updateTab(tab.value.connectionUuid, tab.value.path, {
        znodeData: details.data,
        stat: details.stat,
        acl: details.acl,
      });
      znodeTabsStore.setDirty(tab.value.connectionUuid, tab.value.path, false);
      await logsStore.addLog('current', 'SET_DATA', `Updated data of ${tab.value.path}`);
      showToast.success(t('node.saveSuccess'));
    } catch (error: unknown) {
      const errorMsg = getErrorMessage(error);
      showToast.error(errorMsg);
    } finally {
      isSubmitting.value = false;
    }
  };

  return {
    dataFormat,
    editValue,
    errorMessage,
    format,
    formatOptions: FORMAT_OPTIONS,
    hasUnsavedChanges,
    isDirty,
    isSubmitting,
    save,
  };
};
