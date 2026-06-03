import { useI18n } from 'vue-i18n';
import { zkApi } from '../api/zk';
import { confirmDialog } from './useConfirmDialog';
import { useLogsStore } from '../stores/logs';
import { useZkTreeStore } from '../stores/zkTree';
import { useZnodeTabsStore } from '../stores/znodeTabs';
import { getErrorCode, getErrorMessage } from '../utils/errors';
import { showToast } from '../utils/toast';

interface DeleteNodeOptions {
  connectionUuid: string;
  path: string;
  logConnectionName?: string;
}

export const useZnodeDelete = () => {
  const { t } = useI18n();
  const logsStore = useLogsStore();
  const zkTreeStore = useZkTreeStore();
  const znodeTabsStore = useZnodeTabsStore();

  const logNameFor = (options: DeleteNodeOptions) =>
    options.logConnectionName || options.connectionUuid;

  const blockRootDelete = async (options: DeleteNodeOptions) => {
    if (options.path !== '/') return false;
    const message = t('node.rootDeleteBlocked');
    await logsStore.addLog(logNameFor(options), 'DELETE', message, false);
    showToast.error(message);
    return true;
  };

  const deleteNode = async (options: DeleteNodeOptions) => {
    if (await blockRootDelete(options)) return false;

    try {
      await zkApi.deleteNode(options.connectionUuid, options.path);
      await logsStore.addLog(logNameFor(options), 'DELETE', `Deleted node ${options.path}`);
      znodeTabsStore.delTab(options.connectionUuid, options.path);
      await zkTreeStore.onNodeDeleted(options.connectionUuid, options.path);
      showToast.success(t('node.deleteSuccess'));
      return true;
    } catch (error: unknown) {
      const errorMsg = getErrorMessage(error);
      await logsStore.addLog(
        logNameFor(options),
        'DELETE',
        `Failed to delete node ${options.path}: ${errorMsg}`,
        false,
      );

      if (getErrorCode(error) === 'NOT_EMPTY') {
        showToast.error(t('node.deleteNonEmptyHint', { path: options.path }));
      } else {
        showToast.error(errorMsg);
      }
      return false;
    }
  };

  const deleteNodeRecursive = async (options: DeleteNodeOptions) => {
    if (await blockRootDelete(options)) return false;

    if (
      !(await confirmDialog({
        title: t('node.confirmRecursiveDeleteTitle'),
        message: t('node.confirmRecursiveDeleteMsg', { path: options.path }),
        variant: 'destructive',
        confirmText: t('node.deleteRecursive'),
      }))
    ) {
      return false;
    }

    if (
      znodeTabsStore.hasDirtyTabsByPathPrefix(options.connectionUuid, options.path)
      && !(await confirmDialog({
        message: t('tabs.confirmRecursiveDeleteDirty'),
        variant: 'destructive',
        confirmText: t('node.deleteRecursive'),
      }))
    ) {
      return false;
    }

    try {
      await zkApi.deleteNodeRecursive(options.connectionUuid, options.path);
      await logsStore.addLog(logNameFor(options), 'DELETE', `Recursively deleted node ${options.path}`);
      znodeTabsStore.closeTabsByPathPrefix(options.connectionUuid, options.path);
      await zkTreeStore.onNodeDeletedRecursive(options.connectionUuid, options.path);
      showToast.success(t('node.deleteRecursiveSuccess'));
      return true;
    } catch (error: unknown) {
      const errorMsg = getErrorMessage(error);
      await logsStore.addLog(
        logNameFor(options),
        'DELETE',
        `Failed to recursively delete node ${options.path}: ${errorMsg}`,
        false,
      );
      showToast.error(errorMsg);
      return false;
    }
  };

  return {
    deleteNode,
    deleteNodeRecursive,
  };
};
