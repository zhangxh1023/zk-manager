import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface ZnodeTab {
  connectionUuid: string;
  path: string;
  znodeData: number[];
  isActive: boolean;
}

export const useZnodeTabsStore = defineStore('znodeTabs', () => {
  const znodeTabs = ref<ZnodeTab[]>([]);

  const addTab = (newTab: ZnodeTab) => {
    // todo temp
    for (const item of znodeTabs.value) {
      item.isActive = false;
    }
    znodeTabs.value.push(newTab);
  }

  const delTab = (path: string) => {
    znodeTabs.value = znodeTabs.value.filter(item => item.path !== path);
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

  return {
    znodeTabs,
    addTab,
    delTab,
    setActiveTab,
  }
})
