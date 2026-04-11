<script setup lang="ts">
import { useZnodeTabsStore } from '../../stores/znodeTabs';
import { useI18n } from 'vue-i18n';
import DataInspector from '../dataInspector/DataInspector.vue';
import { X } from 'lucide-vue-next';

const { t } = useI18n();
const znodeTabsStore = useZnodeTabsStore();

const closeTab = (path: string, event: Event) => {
  event.stopPropagation();
  znodeTabsStore.delTab(path);
};

const setActive = (path: string) => {
  znodeTabsStore.setActiveTab(path);
};
</script>

<template>
  <div class="h-full flex flex-col">
    <div v-if="znodeTabsStore.znodeTabs.length" class="flex-1 flex flex-col p-2 overflow-hidden">
      <!-- Tab bar -->
      <div class="flex shrink-0 border-b pb-2 mb-2">
        <div
          v-for="tab in znodeTabsStore.znodeTabs"
          :key="tab.path"
          class="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-l-md rounded-r-md mr-1 cursor-pointer transition-colors"
          :class="tab.isActive
            ? 'bg-primary text-primary-foreground border-primary'
            : 'bg-muted hover:bg-muted/80 border-muted-foreground/20'"
          @click="setActive(tab.path)"
        >
          <span class="truncate max-w-32">{{ tab.path.split('/').pop() || '/' }}</span>
          <X
            class="w-3 h-3 shrink-0 hover:text-destructive"
            @click="closeTab(tab.path, $event)"
          />
        </div>
      </div>
      <!-- Tab content -->
      <div
        v-for="tab in znodeTabsStore.znodeTabs"
        :key="tab.path"
        v-show="tab.isActive"
        class="flex-1 overflow-hidden"
      >
        <DataInspector :tab="tab" />
      </div>
    </div>
    <div v-else class="h-full flex items-center justify-center text-muted-foreground text-sm">
      {{ t('tabs.selectNode') }}
    </div>
  </div>
</template>