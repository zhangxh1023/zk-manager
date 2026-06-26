import { onUnmounted, ref, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { zkApi } from '../../../api/zk';
import { confirmDialog } from '../../../composables/useConfirmDialog';
import { useLogsStore } from '../../../stores/logs';
import { useZnodeTabsStore, type ZnodeTab } from '../../../stores/znodeTabs';
import { getErrorMessage } from '../../../utils/errors';
import { showToast } from '../../../utils/toast';

export const useNodeActions = (
  tab: Ref<ZnodeTab>,
  hasUnsavedChanges: () => boolean,
  isSubmitting: Ref<boolean>,
) => {
  const { t } = useI18n();
  const znodeTabsStore = useZnodeTabsStore();
  const logsStore = useLogsStore();

  const copiedPath = ref(false);
  let copiedPathResetTimer: ReturnType<typeof setTimeout> | null = null;

  const refresh = async () => {
    if (hasUnsavedChanges() && !(await confirmDialog(t('tabs.confirmRefreshDirty')))) {
      return;
    }
    isSubmitting.value = true;
    try {
      const details = await zkApi.getDetails(tab.value.connectionUuid, tab.value.path);
      znodeTabsStore.updateTab(tab.value.connectionUuid, tab.value.path, {
        znodeData: details.data,
        stat: details.stat,
        acl: details.acl,
      });
      znodeTabsStore.setDeleted(tab.value.connectionUuid, tab.value.path, false);
      await logsStore.addLog('current', 'REFRESH', `Refreshed node ${tab.value.path}`);
    } catch (error) {
      const msg = getErrorMessage(error);
      if (msg.includes('NoNode') || msg.includes('does not exist')) {
        znodeTabsStore.setDeleted(tab.value.connectionUuid, tab.value.path, true);
      }
      showToast.error(msg);
    } finally {
      isSubmitting.value = false;
    }
  };

  const writeClipboardText = async (text: string) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.readOnly = true;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.select();

    try {
      if (!document.execCommand('copy')) {
        throw new Error('Copy command failed');
      }
    } finally {
      document.body.removeChild(textarea);
    }
  };

  const copyPath = async () => {
    try {
      await writeClipboardText(tab.value.path);
      copiedPath.value = true;
      showToast.success(t('node.pathCopied'));

      if (copiedPathResetTimer) {
        clearTimeout(copiedPathResetTimer);
      }
      copiedPathResetTimer = setTimeout(() => {
        copiedPath.value = false;
        copiedPathResetTimer = null;
      }, 1500);
    } catch {
      showToast.error(t('node.copyPathFailed'));
    }
  };

  onUnmounted(() => {
    if (copiedPathResetTimer) {
      clearTimeout(copiedPathResetTimer);
      copiedPathResetTimer = null;
    }
  });

  return {
    copiedPath,
    copyPath,
    refresh,
  };
};
