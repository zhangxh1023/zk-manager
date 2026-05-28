import { onUnmounted, ref, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { zkApi } from '../../../api/zk';
import { confirmDialog } from '../../../composables/useConfirmDialog';
import { useLogsStore } from '../../../stores/logs';
import { useZkTreeStore } from '../../../stores/zkTree';
import { useZnodeTabsStore, type ZnodeTab } from '../../../stores/znodeTabs';
import { getErrorMessage } from '../../../utils/errors';
import { showToast } from '../../../utils/toast';
import { buildChildPath } from '../utils';

export const useNodeActions = (
  tab: Ref<ZnodeTab>,
  hasUnsavedChanges: () => boolean,
  isSubmitting: Ref<boolean>,
  errorMessage: Ref<string>,
  showDeleteDialog: Ref<boolean>,
) => {
  const { t } = useI18n();
  const znodeTabsStore = useZnodeTabsStore();
  const logsStore = useLogsStore();
  const zkTreeStore = useZkTreeStore();

  const copiedPath = ref(false);
  const showCreateDialog = ref(false);
  const newNodeName = ref('');
  const newNodeData = ref('');
  const createMissingParents = ref(false);
  let copiedPathResetTimer: ReturnType<typeof setTimeout> | null = null;

  const refresh = async () => {
    if (hasUnsavedChanges() && !(await confirmDialog(t('tabs.confirmRefreshDirty')))) {
      return;
    }
    isSubmitting.value = true;
    errorMessage.value = '';
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
      errorMessage.value = msg;
    } finally {
      isSubmitting.value = false;
    }
  };

  const openCreateDialog = () => {
    newNodeName.value = '';
    newNodeData.value = '';
    createMissingParents.value = false;
    errorMessage.value = '';
    showCreateDialog.value = true;
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

  const createChildNode = async () => {
    const childPath = buildChildPath(tab.value.path, newNodeName.value);
    if (!childPath) {
      errorMessage.value = 'Node name cannot be empty';
      return;
    }
    isSubmitting.value = true;
    errorMessage.value = '';
    try {
      const encoder = new TextEncoder();
      const data = Array.from(encoder.encode(newNodeData.value));
      if (createMissingParents.value) {
        await zkApi.createNodeRecursive(tab.value.connectionUuid, childPath, data);
      } else {
        await zkApi.createNode(tab.value.connectionUuid, childPath, data);
      }
      const logMessage = createMissingParents.value
        ? `Recursively created node ${childPath}`
        : `Created node ${childPath}`;
      await logsStore.addLog('current', 'CREATE', logMessage);
      await zkTreeStore.onNodeCreated(tab.value.connectionUuid, tab.value.path);
      showCreateDialog.value = false;
      showToast.success(t('node.createSuccess', { path: childPath }));
    } catch (error: unknown) {
      const errMsg = getErrorMessage(error);
      await logsStore.addLog('current', 'CREATE', `Failed to create node ${childPath}: ${errMsg}`, false);
      showToast.error(errMsg);
    } finally {
      isSubmitting.value = false;
    }
  };

  const removeNode = async () => {
    isSubmitting.value = true;
    errorMessage.value = '';
    try {
      await zkApi.deleteNode(tab.value.connectionUuid, tab.value.path);
      await logsStore.addLog('current', 'DELETE', `Deleted node ${tab.value.path}`);
      await zkTreeStore.onNodeDeleted(tab.value.connectionUuid, tab.value.path);
      znodeTabsStore.delTab(tab.value.connectionUuid, tab.value.path);
      showDeleteDialog.value = false;
      showToast.success(t('node.deleteSuccess'));
    } catch (error: unknown) {
      const errorMsg = getErrorMessage(error);
      showToast.error(errorMsg);
    } finally {
      isSubmitting.value = false;
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
    createChildNode,
    createMissingParents,
    newNodeData,
    newNodeName,
    openCreateDialog,
    refresh,
    removeNode,
    showCreateDialog,
  };
};
