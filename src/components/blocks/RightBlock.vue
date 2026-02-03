<script setup lang="ts">
import { ref, watch } from 'vue';
import { useZNodeTabsStore } from '../../stores/zNodeTabs';
import DataInspector from '../dataInspector/DataInspector.vue';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { X } from 'lucide-vue-next';
import { ScrollArea, ScrollBar } from '../ui/scroll-area';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '../ui/context-menu';

const zNodeTabsStore = useZNodeTabsStore();
const activeTab = ref('');
watch(zNodeTabsStore.zNodeTabs, () => {
  console.log(zNodeTabsStore.zNodeTabs);
  for (const tab of zNodeTabsStore.zNodeTabs) {
    if (tab.isActive) {
      activeTab.value = tab.path;
      break;
    }
  }
}, { immediate: true })

const closeZNodeTab = (path: string) => {
  console.log(path)
  zNodeTabsStore.delZNodeTab(path);
}

const clickTab = (path: string) => {
  zNodeTabsStore.setActiveTab(path);
}

</script>

<template>
  <div
    v-show="zNodeTabsStore.zNodeTabs.length" 
    class="p-2 h-full box-border"
  >
    <Tabs
      :model-value="activeTab"
      class="w-full"
    >
      <ScrollArea class="w-full">
        <TabsList class="w-full justify-start">
          <ContextMenu
            v-for="tab in zNodeTabsStore.zNodeTabs"
            :key="tab.path"
          >
            <ContextMenuTrigger as-child>
              <TabsTrigger
                :value="tab.path"
                class="cursor-pointer max-w-50"
                @click="clickTab(tab.path)"
              >
                {{ tab.path }}
                <span
                  class="ml-2"
                  @click.stop="closeZNodeTab(tab.path)"
                >
                  <X class="w-4 h-4" />
                </span>
              </TabsTrigger>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem>close</ContextMenuItem>
              <ContextMenuItem>close others</ContextMenuItem>
              <ContextMenuItem>close to the Right</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </TabsList>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      <TabsContent
        v-for="tab in zNodeTabsStore.zNodeTabs"
        :key="tab.path"
        :value="tab.path"
      >
        <DataInspector />
      </TabsContent>
    </Tabs>
  </div>
</template>