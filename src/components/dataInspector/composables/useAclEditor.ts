import { computed, ref, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { zkApi } from '../../../api/zk';
import { useLogsStore } from '../../../stores/logs';
import { useZnodeTabsStore, type ZnodeTab } from '../../../stores/znodeTabs';
import type { ZkAclEntry } from '../../../types/znodeDetails';
import { getErrorMessage } from '../../../utils/errors';

export const PERMISSION_OPTIONS = ['READ', 'WRITE', 'CREATE', 'DELETE', 'ADMIN'];
export const SCHEME_OPTIONS = ['world', 'auth', 'digest'];

export const useAclEditor = (
  tab: Ref<ZnodeTab>,
  isSubmitting: Ref<boolean>,
  errorMessage: Ref<string>,
) => {
  const { t } = useI18n();
  const znodeTabsStore = useZnodeTabsStore();
  const logsStore = useLogsStore();

  const editingAcl = ref<ZkAclEntry | null>(null);
  const showAclDialog = ref(false);
  const showAclDeleteDialog = ref(false);
  const aclToDelete = ref<ZkAclEntry | null>(null);

  const openEditAcl = (acl: ZkAclEntry) => {
    editingAcl.value = { ...acl };
    showAclDialog.value = true;
  };

  const addNewAcl = () => {
    editingAcl.value = { scheme: 'world', id: 'anyone', permission: 'ALL' };
    showAclDialog.value = true;
  };

  const saveAcl = async () => {
    if (!editingAcl.value) return;
    isSubmitting.value = true;
    errorMessage.value = '';
    try {
      if (!tab.value.stat) {
        throw new Error(t('node.refreshBeforeSave'));
      }
      const newAclList = [
        ...tab.value.acl.filter(a =>
          !(a.scheme === editingAcl.value!.scheme && a.id === editingAcl.value!.id),
        ),
        editingAcl.value,
      ];
      await zkApi.setAcl(
        tab.value.connectionUuid,
        tab.value.path,
        newAclList,
        tab.value.stat.aversion,
      );
      const details = await zkApi.getDetails(tab.value.connectionUuid, tab.value.path);
      znodeTabsStore.updateTab(tab.value.connectionUuid, tab.value.path, {
        znodeData: details.data,
        stat: details.stat,
        acl: details.acl,
      });
      await logsStore.addLog('current', 'SET_ACL', `Updated ACL of ${tab.value.path}`);
      showAclDialog.value = false;
    } catch (error) {
      errorMessage.value = getErrorMessage(error);
    } finally {
      isSubmitting.value = false;
    }
  };

  const confirmDeleteAcl = (acl: ZkAclEntry) => {
    aclToDelete.value = acl;
    showAclDeleteDialog.value = true;
  };

  const deleteAcl = async () => {
    if (!aclToDelete.value) return;
    isSubmitting.value = true;
    errorMessage.value = '';
    try {
      if (!tab.value.stat) {
        throw new Error(t('node.refreshBeforeSave'));
      }
      const newAclList = tab.value.acl.filter(a =>
        !(a.scheme === aclToDelete.value!.scheme && a.id === aclToDelete.value!.id),
      );
      await zkApi.setAcl(
        tab.value.connectionUuid,
        tab.value.path,
        newAclList,
        tab.value.stat.aversion,
      );
      const details = await zkApi.getDetails(tab.value.connectionUuid, tab.value.path);
      znodeTabsStore.updateTab(tab.value.connectionUuid, tab.value.path, {
        znodeData: details.data,
        stat: details.stat,
        acl: details.acl,
      });
      await logsStore.addLog('current', 'DELETE_ACL', `Deleted ACL from ${tab.value.path}`);
      showAclDeleteDialog.value = false;
      aclToDelete.value = null;
    } catch (error) {
      errorMessage.value = getErrorMessage(error);
    } finally {
      isSubmitting.value = false;
    }
  };

  const selectedPermissions = computed(() => {
    if (!editingAcl.value) return [];
    if (editingAcl.value.permission === 'ALL') return [...PERMISSION_OPTIONS];
    if (editingAcl.value.permission === 'NONE') return [];
    return editingAcl.value.permission
      .split('|')
      .map(part => part.trim().toUpperCase())
      .filter(part => PERMISSION_OPTIONS.includes(part));
  });

  const allPermissionsSelected = computed(() =>
    selectedPermissions.value.length === PERMISSION_OPTIONS.length,
  );

  const setAclPermissionParts = (parts: string[]) => {
    if (!editingAcl.value) return;
    const uniqueParts = PERMISSION_OPTIONS.filter(permission => parts.includes(permission));
    if (uniqueParts.length === PERMISSION_OPTIONS.length) {
      editingAcl.value.permission = 'ALL';
    } else if (uniqueParts.length === 0) {
      editingAcl.value.permission = 'NONE';
    } else {
      editingAcl.value.permission = uniqueParts.join('|');
    }
  };

  const toggleAclPermission = (permission: string, checked: boolean) => {
    const nextPermissions = new Set(selectedPermissions.value);
    if (checked) {
      nextPermissions.add(permission);
    } else {
      nextPermissions.delete(permission);
    }
    setAclPermissionParts([...nextPermissions]);
  };

  const toggleAllAclPermissions = (checked: boolean) => {
    setAclPermissionParts(checked ? [...PERMISSION_OPTIONS] : []);
  };

  const schemeHint = computed(() => {
    if (!editingAcl.value) return '';
    switch (editingAcl.value.scheme) {
      case 'world': return t('acl.schemeHint.world');
      case 'digest': return t('acl.schemeHint.digest');
      case 'auth': return t('acl.schemeHint.auth');
      default: return '';
    }
  });

  const updateAclField = (field: keyof ZkAclEntry, value: string) => {
    if (!editingAcl.value) return;
    editingAcl.value = {
      ...editingAcl.value,
      [field]: value,
    };
  };

  const validateAndSaveAcl = async () => {
    if (!editingAcl.value) return;
    const { scheme, id } = editingAcl.value;
    if (scheme === 'world' && id !== 'anyone') {
      errorMessage.value = t('acl.invalidWorldId');
      return;
    }
    if (scheme === 'digest' && !id.includes(':')) {
      errorMessage.value = t('acl.invalidDigestId');
      return;
    }
    if (editingAcl.value.permission === 'NONE') {
      errorMessage.value = t('acl.invalidPermission');
      return;
    }
    await saveAcl();
  };

  return {
    addNewAcl,
    allPermissionsSelected,
    confirmDeleteAcl,
    deleteAcl,
    editingAcl,
    openEditAcl,
    permissionOptions: PERMISSION_OPTIONS,
    schemeHint,
    schemeOptions: SCHEME_OPTIONS,
    selectedPermissions,
    showAclDeleteDialog,
    showAclDialog,
    toggleAclPermission,
    toggleAllAclPermissions,
    updateAclField,
    validateAndSaveAcl,
  };
};
