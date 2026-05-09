import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ZkAclEntry, ZkStat } from '../types/znodeDetails';

export interface ZnodeTab {
  connectionUuid: string;
  path: string;
  znodeData: number[];
  stat: ZkStat | null;
  acl: ZkAclEntry[];
  isActive: boolean;
  isTemporary: boolean;
  isDirty?: boolean;
  isWatching?: boolean;
  isDeleted?: boolean;
}

export const useZnodeTabsStore = defineStore('znodeTabs', () => {
  const znodeTabs = ref<ZnodeTab[]>([]);
  const activeTab = computed(() => znodeTabs.value.find(item => item.isActive) ?? null);

  const tabMatches = (tab: ZnodeTab, connectionUuid: string, path: string) =>
    tab.connectionUuid === connectionUuid && tab.path === path;

  const findTab = (connectionUuid: string, path: string) =>
    znodeTabs.value.find(item => tabMatches(item, connectionUuid, path)) ?? null;

  const hasDirtyTab = (connectionUuid: string, path: string) =>
    findTab(connectionUuid, path)?.isDirty === true;

  const hasDirtyTabsByConnection = (connectionUuid: string) =>
    znodeTabs.value.some(item => item.connectionUuid === connectionUuid && item.isDirty);

  const tabIsInSubtree = (tab: ZnodeTab, connectionUuid: string, path: string) =>
    tab.connectionUuid === connectionUuid
    && (tab.path === path || tab.path.startsWith(path === '/' ? '/' : `${path}/`));

  const hasDirtyTabsByPathPrefix = (connectionUuid: string, path: string) =>
    znodeTabs.value.some(item => tabIsInSubtree(item, connectionUuid, path) && item.isDirty);

  const getDirtyTemporaryTabForReplacement = (connectionUuid: string, path: string) => {
    if (findTab(connectionUuid, path)) return null;
    return znodeTabs.value.find(item => item.isTemporary && item.isDirty) ?? null;
  };

  // Add a new tab (for "Open in New Tab")
  // Returns true if tab existed and was activated, false if new tab was created
  const addTab = (newTab: ZnodeTab): boolean => {
    const existed = znodeTabs.value.find(item => tabMatches(item, newTab.connectionUuid, newTab.path));
    if (existed) {
      // Update existing tab and set it as active
      existed.znodeData = newTab.znodeData;
      existed.stat = newTab.stat;
      existed.acl = newTab.acl;
      existed.isActive = true;
      existed.isTemporary = false; // Making it permanent when re-selected
      existed.isDeleted = false;
      // Deactivate other tabs
      for (const item of znodeTabs.value) {
        if (item !== existed) {
          item.isActive = false;
        }
      }
      return true; // Tab existed
    } else {
      // Deactivate all existing tabs first
      for (const item of znodeTabs.value) {
        item.isActive = false;
      }
      // Add new tab as active and permanent
      znodeTabs.value.push({
        ...newTab,
        isActive: true,
        isTemporary: false, // Permanent tab
        isDirty: false,
      });
      return false; // New tab created
    }
  }

  // Replace the temporary tab or create a new temporary tab
  // For left-click navigation
  // Returns true if existing tab was activated, false if new tab was created
  const replaceOrCreateTemporaryTab = (newTab: ZnodeTab): boolean => {
    // First check if this path already has an existing tab
    const existingTab = znodeTabs.value.find(item => tabMatches(item, newTab.connectionUuid, newTab.path));

    if (existingTab) {
      // Update existing tab and set it as active
      existingTab.znodeData = newTab.znodeData;
      existingTab.stat = newTab.stat;
      existingTab.acl = newTab.acl;
      existingTab.isActive = true;
      existingTab.isDeleted = false;
      // Keep existing isTemporary state (don't change it)
      // Deactivate other tabs
      for (const item of znodeTabs.value) {
        if (item !== existingTab) {
          item.isActive = false;
        }
      }
      return true; // Existing tab was activated
    }

    // No existing tab for this path, create or replace temporary tab
    const existingTemporary = znodeTabs.value.find(item => item.isTemporary);

    if (existingTemporary) {
      // Replace the temporary tab
      existingTemporary.connectionUuid = newTab.connectionUuid;
      existingTemporary.path = newTab.path;
      existingTemporary.znodeData = newTab.znodeData;
      existingTemporary.stat = newTab.stat;
      existingTemporary.acl = newTab.acl;
      existingTemporary.isActive = true;
      existingTemporary.isDeleted = false;
      existingTemporary.isDirty = false;
      existingTemporary.isWatching = false;
      // Keep isTemporary = true
      // Deactivate other tabs
      for (const item of znodeTabs.value) {
        if (item !== existingTemporary) {
          item.isActive = false;
        }
      }
    } else {
      // No temporary tab exists, create one
      // First deactivate all permanent tabs
      for (const item of znodeTabs.value) {
        item.isActive = false;
      }
      znodeTabs.value.push({
        ...newTab,
        isActive: true,
        isTemporary: true, // Temporary tab
        isDirty: false,
      });
    }
    return false; // New temporary tab was created
  }

  // Make a tab permanent (for double-click)
  const makePermanent = (connectionUuid: string, path: string) => {
    const tab = znodeTabs.value.find(item => tabMatches(item, connectionUuid, path));
    if (tab) {
      tab.isTemporary = false;
    }
  }

  const delTab = (connectionUuid: string, path: string) => {
    const deletingActive = activeTab.value
      ? tabMatches(activeTab.value, connectionUuid, path)
      : false;
    znodeTabs.value = znodeTabs.value.filter(item => !tabMatches(item, connectionUuid, path));
    if (deletingActive && znodeTabs.value.length) {
      znodeTabs.value[znodeTabs.value.length - 1].isActive = true;
    }
  }

  // Update tab data (without replacing the whole tab)
  const updateTab = (connectionUuid: string, path: string, updates: Partial<Pick<ZnodeTab, 'znodeData' | 'stat' | 'acl'>>) => {
    const tab = znodeTabs.value.find(item => tabMatches(item, connectionUuid, path));
    if (tab) {
      if (updates.znodeData !== undefined) tab.znodeData = updates.znodeData;
      if (updates.stat !== undefined) tab.stat = updates.stat;
      if (updates.acl !== undefined) tab.acl = updates.acl;
    }
  };

  const setActiveTab = (connectionUuid: string, path: string) => {
    for (const item of znodeTabs.value) {
      if (tabMatches(item, connectionUuid, path)) {
        item.isActive = true;
      } else {
        item.isActive = false;
      }
    }
  }

  const setDirty = (connectionUuid: string, path: string, dirty: boolean) => {
    const tab = znodeTabs.value.find(item => tabMatches(item, connectionUuid, path));
    if (tab) {
      tab.isDirty = dirty;
    }
  }

  const setWatching = (connectionUuid: string, path: string, watching: boolean) => {
    const tab = znodeTabs.value.find(item => tabMatches(item, connectionUuid, path));
    if (tab) {
      tab.isWatching = watching;
    }
  }

  const setDeleted = (connectionUuid: string, path: string, deleted: boolean) => {
    const tab = znodeTabs.value.find(item => tabMatches(item, connectionUuid, path));
    if (tab) {
      tab.isDeleted = deleted;
    }
  }

  const closeTabsByConnection = (uuid: string) => {
    znodeTabs.value = znodeTabs.value.filter(item => item.connectionUuid !== uuid);
    // Ensure active tab logic
    if (activeTab.value === null && znodeTabs.value.length) {
      znodeTabs.value[znodeTabs.value.length - 1].isActive = true;
    }
  }

  const closeTabsByPathPrefix = (connectionUuid: string, path: string) => {
    const closingActive = activeTab.value
      ? tabIsInSubtree(activeTab.value, connectionUuid, path)
      : false;
    znodeTabs.value = znodeTabs.value.filter(item => !tabIsInSubtree(item, connectionUuid, path));
    if (closingActive && znodeTabs.value.length) {
      znodeTabs.value[znodeTabs.value.length - 1].isActive = true;
    }
  }

  const closeOtherTabs = (connectionUuid: string, path: string) => {
    znodeTabs.value = znodeTabs.value.filter(item => tabMatches(item, connectionUuid, path));
    setActiveTab(connectionUuid, path);
  }

  const closeTabsToRight = (connectionUuid: string, path: string) => {
    const currentIndex = znodeTabs.value.findIndex(item => tabMatches(item, connectionUuid, path));
    if (currentIndex === -1) {
      return;
    }
    znodeTabs.value = znodeTabs.value.filter((_, index) => index <= currentIndex);
    setActiveTab(connectionUuid, path);
  }

  const clearTabs = () => {
    znodeTabs.value = [];
  }

  return {
    znodeTabs,
    activeTab,
    findTab,
    hasDirtyTab,
    hasDirtyTabsByConnection,
    hasDirtyTabsByPathPrefix,
    getDirtyTemporaryTabForReplacement,
    addTab,
    replaceOrCreateTemporaryTab,
    makePermanent,
    updateTab,
    delTab,
    setActiveTab,
    closeOtherTabs,
    closeTabsToRight,
    clearTabs,
    setDirty,
    setWatching,
    setDeleted,
    closeTabsByConnection,
    closeTabsByPathPrefix,
  }
})
