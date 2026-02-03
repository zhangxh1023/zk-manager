import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface ZNodeTab {
  connectionUuid: string;
  path: string;
  zNodeData: number[];
  isActive: boolean;
}

export const useZNodeTabsStore = defineStore('zNodeTabs', () => {
  const zNodeTabs = ref<ZNodeTab[]>([]);

  const addZNodeTab = (newTab: ZNodeTab) => {
    // todo temp
    for (const item of zNodeTabs.value) {
      item.isActive = false;
    }
    zNodeTabs.value.push(newTab);
  }

  const delZNodeTab = (path: string) => {
    zNodeTabs.value = zNodeTabs.value.filter(item => item.path !== path);
  }

  const setActiveTab = (path: string) => {
    for (const item of zNodeTabs.value) {
      if (item.path === path) {
        item.isActive = true;
      } else {
        item.isActive = false;
      }
    }
  }

  return {
    zNodeTabs,
    addZNodeTab,
    delZNodeTab,
    setActiveTab,
  }
})
