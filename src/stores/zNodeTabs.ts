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
}

export const useZnodeTabsStore = defineStore('znodeTabs', () => {
  const znodeTabs = ref<ZnodeTab[]>([]);
  const activeTab = computed(() => znodeTabs.value.find(item => item.isActive) ?? null);

  // Add a new tab (for "Open in New Tab")
  // Returns true if tab existed and was activated, false if new tab was created
  const addTab = (newTab: ZnodeTab): boolean => {
    const existed = znodeTabs.value.find(item => item.path === newTab.path);
    if (existed) {
      // Update existing tab and set it as active
      existed.connectionUuid = newTab.connectionUuid;
      existed.znodeData = newTab.znodeData;
      existed.stat = newTab.stat;
      existed.acl = newTab.acl;
      existed.isActive = true;
      existed.isTemporary = false; // Making it permanent when re-selected
      // Deactivate other tabs
      for (const item of znodeTabs.value) {
        if (item.path !== newTab.path) {
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
      });
      return false; // New tab created
    }
  }

  // Replace the temporary tab or create a new temporary tab
  // For left-click navigation
  // Returns true if existing tab was activated, false if new tab was created
  const replaceOrCreateTemporaryTab = (newTab: ZnodeTab): boolean => {
    // First check if this path already has an existing tab
    const existingTab = znodeTabs.value.find(item => item.path === newTab.path);

    if (existingTab) {
      // Update existing tab and set it as active
      existingTab.connectionUuid = newTab.connectionUuid;
      existingTab.znodeData = newTab.znodeData;
      existingTab.stat = newTab.stat;
      existingTab.acl = newTab.acl;
      existingTab.isActive = true;
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
      });
    }
    return false; // New temporary tab was created
  }

  // Make a tab permanent (for double-click)
  const makePermanent = (path: string) => {
    const tab = znodeTabs.value.find(item => item.path === path);
    if (tab) {
      tab.isTemporary = false;
    }
  }

  const delTab = (path: string) => {
    const deletingActive = activeTab.value?.path === path;
    znodeTabs.value = znodeTabs.value.filter(item => item.path !== path);
    if (deletingActive && znodeTabs.value.length) {
      znodeTabs.value[znodeTabs.value.length - 1].isActive = true;
    }
  }

  // Update tab data (without replacing the whole tab)
  const updateTab = (path: string, updates: Partial<Pick<ZnodeTab, 'znodeData' | 'stat' | 'acl'>>) => {
    const tab = znodeTabs.value.find(item => item.path === path);
    if (tab) {
      if (updates.znodeData !== undefined) tab.znodeData = updates.znodeData;
      if (updates.stat !== undefined) tab.stat = updates.stat;
      if (updates.acl !== undefined) tab.acl = updates.acl;
    }
  };

  const setActiveTab = (path: string) => {
    for (const item of znodeTabs.value) {
      if (item.path === path) {
        item.isActive = true;
      } else {
        item.isActive = false;
      }
    }
  }

  const closeOtherTabs = (path: string) => {
    znodeTabs.value = znodeTabs.value.filter(item => item.path === path);
    setActiveTab(path);
  }

  const closeTabsToRight = (path: string) => {
    const currentIndex = znodeTabs.value.findIndex(item => item.path === path);
    if (currentIndex === -1) {
      return;
    }
    znodeTabs.value = znodeTabs.value.filter((_, index) => index <= currentIndex);
    setActiveTab(path);
  }

  const clearTabs = () => {
    znodeTabs.value = [];
  }

  return {
    znodeTabs,
    activeTab,
    addTab,
    replaceOrCreateTemporaryTab,
    makePermanent,
    updateTab,
    delTab,
    setActiveTab,
    closeOtherTabs,
    closeTabsToRight,
    clearTabs,
  }
})
