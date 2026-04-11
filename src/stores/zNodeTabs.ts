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
}

export const useZnodeTabsStore = defineStore('znodeTabs', () => {
  const znodeTabs = ref<ZnodeTab[]>([]);
  const activeTab = computed(() => znodeTabs.value.find(item => item.isActive) ?? null);

  const addTab = (newTab: ZnodeTab) => {
    for (const item of znodeTabs.value) {
      if (item.path === newTab.path) {
        item.connectionUuid = newTab.connectionUuid;
        item.znodeData = newTab.znodeData;
        item.stat = newTab.stat;
        item.acl = newTab.acl;
        item.isActive = true;
      } else {
        item.isActive = false;
      }
    }
    const existed = znodeTabs.value.some(item => item.path === newTab.path);
    if (!existed) {
      znodeTabs.value.push({
        ...newTab,
        isActive: true,
      });
    }
  }

  const delTab = (path: string) => {
    const deletingActive = activeTab.value?.path === path;
    znodeTabs.value = znodeTabs.value.filter(item => item.path !== path);
    if (deletingActive && znodeTabs.value.length) {
      znodeTabs.value[znodeTabs.value.length - 1].isActive = true;
    }
  }

  // Replace the active tab with a new one (for left-click navigation)
  const replaceActiveTab = (newTab: ZnodeTab) => {
    // Remove all existing tabs and add new one
    znodeTabs.value = [{
      ...newTab,
      isActive: true,
    }];
  }

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
    replaceActiveTab,
    delTab,
    setActiveTab,
    closeOtherTabs,
    closeTabsToRight,
    clearTabs,
  }
})
