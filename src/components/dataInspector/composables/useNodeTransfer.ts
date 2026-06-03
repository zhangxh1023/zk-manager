import { type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { zkApi } from '../../../api/zk';
import { confirmDialog } from '../../../composables/useConfirmDialog';
import { useLogsStore } from '../../../stores/logs';
import { useZkTreeStore } from '../../../stores/zkTree';
import { useZnodeTabsStore, type ZnodeTab } from '../../../stores/znodeTabs';
import { getErrorCode, getErrorMessage } from '../../../utils/errors';
import {
  createNodeExportPayload,
  joinZkPath,
  parseNodeExportMetadata,
  parseNodeExportPayload,
  relativeNodePath,
  type NodeSnapshot,
  znodeDepth,
} from '../../../utils/nodeTransfer';
import { pickFile, safeFileNamePart, saveJsonFile, timestampFilePart } from '../../../utils/fileTransfer';
import { showToast } from '../../../utils/toast';

export const useNodeTransfer = (
  tab: Ref<ZnodeTab>,
  hasUnsavedChanges: () => boolean,
  isSubmitting: Ref<boolean>,
  errorMessage: Ref<string>,
) => {
  const { t } = useI18n();
  const logsStore = useLogsStore();
  const zkTreeStore = useZkTreeStore();
  const znodeTabsStore = useZnodeTabsStore();

  const childPath = (parentPath: string, childName: string) =>
    parentPath === '/' ? `/${childName}` : `${parentPath}/${childName}`;

  const collectNodeSnapshots = async (
    connectionUuid: string,
    path: string,
  ): Promise<NodeSnapshot[]> => {
    const details = await zkApi.getDetails(connectionUuid, path);
    const snapshots: NodeSnapshot[] = [{ path, data: details.data }];
    const childNames = await zkApi.listChildren(connectionUuid, path);

    for (const childName of childNames) {
      snapshots.push(...await collectNodeSnapshots(
        connectionUuid,
        childPath(path, childName),
      ));
    }

    return snapshots;
  };

  const refreshSelectedTab = async () => {
    const details = await zkApi.getDetails(tab.value.connectionUuid, tab.value.path);
    znodeTabsStore.updateTab(tab.value.connectionUuid, tab.value.path, {
      znodeData: details.data,
      stat: details.stat,
      acl: details.acl,
    });
    znodeTabsStore.setDirty(tab.value.connectionUuid, tab.value.path, false);
    znodeTabsStore.setDeleted(tab.value.connectionUuid, tab.value.path, false);
  };

  const setExistingNodeData = async (path: string, data: number[]) => {
    const details = await zkApi.getDetails(tab.value.connectionUuid, path);
    const updatedDetails = await zkApi.setData(
      tab.value.connectionUuid,
      path,
      data,
      details.stat.version,
    );
    znodeTabsStore.updateTab(tab.value.connectionUuid, path, {
      znodeData: updatedDetails.data,
      stat: updatedDetails.stat,
      acl: updatedDetails.acl,
    });
    znodeTabsStore.setDirty(tab.value.connectionUuid, path, false);
  };

  const upsertNodeData = async (path: string, data: number[]) => {
    try {
      await setExistingNodeData(path, data);
    } catch (error) {
      if (getErrorCode(error) !== 'NO_NODE') {
        throw error;
      }
      await zkApi.createNodeRecursive(tab.value.connectionUuid, path, data);
    }
  };

  const exportNodeData = async () => {
    if (
      hasUnsavedChanges()
      && !(await confirmDialog(t('tabs.confirmExportDirty')))
    ) {
      return;
    }

    isSubmitting.value = true;
    errorMessage.value = '';
    try {
      const snapshots = await collectNodeSnapshots(tab.value.connectionUuid, tab.value.path);
      const payload = createNodeExportPayload(tab.value.path, snapshots);
      const path = await saveJsonFile(payload, {
        defaultPath: `zk-node-${safeFileNamePart(tab.value.path)}-${timestampFilePart()}.json`,
        title: t('node.exportData'),
      });
      if (!path) return;

      await logsStore.addLog(
        'current',
        'EXPORT_NODE_DATA',
        `Exported ${snapshots.length} nodes from ${tab.value.path} to ${path}`,
      );
      showToast.success(t('node.exportSuccess', { count: snapshots.length }));
    } catch (error) {
      const message = getErrorMessage(error);
      errorMessage.value = message;
      await logsStore.addLog(
        'current',
        'EXPORT_NODE_DATA',
        `Failed to export node data from ${tab.value.path}: ${message}`,
        false,
      );
      showToast.error(t('node.exportFailed', { message }));
    } finally {
      isSubmitting.value = false;
    }
  };

  const importNodeSnapshot = async (
    fileName: string,
    sourceRootPath: string,
    snapshots: NodeSnapshot[],
  ) => {
    if (snapshots.length === 0) {
      showToast.error(t('node.importEmpty'));
      return;
    }
    if (
      !(await confirmDialog(t('node.confirmImportSnapshot', {
        count: snapshots.length,
        sourcePath: sourceRootPath,
        targetPath: tab.value.path,
      })))
    ) {
      return;
    }

    isSubmitting.value = true;
    errorMessage.value = '';
    try {
      const plannedSnapshots = snapshots
        .map(snapshot => ({
          path: joinZkPath(
            tab.value.path,
            relativeNodePath(sourceRootPath, snapshot.path),
          ),
          data: snapshot.data,
        }))
        .sort((left, right) => znodeDepth(left.path) - znodeDepth(right.path));

      for (const snapshot of plannedSnapshots) {
        await upsertNodeData(snapshot.path, snapshot.data);
      }

      await refreshSelectedTab();
      await zkTreeStore.onNodeCreated(tab.value.connectionUuid, tab.value.path);
      await logsStore.addLog(
        'current',
        'IMPORT_NODE_DATA',
        `Imported ${plannedSnapshots.length} nodes from ${fileName} into ${tab.value.path}`,
      );
      showToast.success(t('node.importSnapshotSuccess', { count: plannedSnapshots.length }));
    } catch (error) {
      const message = getErrorMessage(error);
      errorMessage.value = message;
      await logsStore.addLog(
        'current',
        'IMPORT_NODE_DATA',
        `Failed to import node snapshot from ${fileName}: ${message}`,
        false,
      );
      showToast.error(t('node.importFailed', { message }));
    } finally {
      isSubmitting.value = false;
    }
  };

  const importRawNodeData = async (fileName: string, bytes: number[]) => {
    if (
      !(await confirmDialog(t('node.confirmImportRawFile', {
        fileName,
        targetPath: tab.value.path,
      })))
    ) {
      return;
    }

    isSubmitting.value = true;
    errorMessage.value = '';
    try {
      await setExistingNodeData(tab.value.path, bytes);
      await logsStore.addLog(
        'current',
        'IMPORT_NODE_DATA',
        `Imported raw data from ${fileName} into ${tab.value.path}`,
      );
      showToast.success(t('node.importRawSuccess'));
    } catch (error) {
      const message = getErrorMessage(error);
      errorMessage.value = message;
      await logsStore.addLog(
        'current',
        'IMPORT_NODE_DATA',
        `Failed to import raw data from ${fileName}: ${message}`,
        false,
      );
      showToast.error(t('node.importFailed', { message }));
    } finally {
      isSubmitting.value = false;
    }
  };

  const importNodeData = async () => {
    if (
      hasUnsavedChanges()
      && !(await confirmDialog(t('tabs.confirmImportDirty')))
    ) {
      return;
    }

    const file = await pickFile([
      {
        name: 'JSON',
        extensions: ['json'],
      },
      {
        name: 'Text',
        extensions: ['txt', 'conf', 'cfg', 'properties', 'xml'],
      },
      {
        name: 'All Files',
        extensions: ['*'],
      },
    ]);
    if (!file) return;

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(file.text);
    } catch {
      parsedJson = null;
    }

    const metadata = parseNodeExportMetadata(parsedJson);
    if (metadata) {
      try {
        await importNodeSnapshot(
          file.name,
          metadata.rootPath,
          parseNodeExportPayload(parsedJson),
        );
      } catch (error) {
        const message = getErrorMessage(error);
        errorMessage.value = message;
        showToast.error(t('node.importFailed', { message }));
      }
      return;
    }

    await importRawNodeData(file.name, file.bytes);
  };

  return {
    exportNodeData,
    importNodeData,
  };
};
