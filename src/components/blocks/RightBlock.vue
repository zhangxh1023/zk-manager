<script setup lang="ts">
import { useZnodeTabsStore } from '../../stores/znodeTabs';
import { useI18n } from 'vue-i18n';
import { FileText, X } from 'lucide-vue-next';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import DataInspector from '../dataInspector/DataInspector.vue';

const { t } = useI18n();
const znodeTabsStore = useZnodeTabsStore();

const closeTab = (path: string, event: Event) => {
  event.stopPropagation();
  znodeTabsStore.delTab(path);
};

const setActive = (path: string) => {
  znodeTabsStore.setActiveTab(path);
};

const makePermanent = (path: string, event: Event) => {
  event.stopPropagation();
  znodeTabsStore.makePermanent(path);
};

const getTabName = (path: string) => {
  const parts = path.split('/');
  return parts[parts.length - 1] || '/';
};
</script>

<template>
  <div class="h-full flex flex-col">
    <div
      v-if="znodeTabsStore.znodeTabs.length"
      class="flex-1 flex flex-col overflow-hidden"
    >
      <!-- Tab bar with horizontal scroll -->
      <div class="flex shrink-0 bg-sidebar-accent/10 overflow-x-auto border-b border-sidebar-border/50">
        <TooltipProvider
          v-for="tab in znodeTabsStore.znodeTabs"
          :key="tab.path"
        >
          <Tooltip>
            <TooltipTrigger as-child>
              <div
                class="flex items-center gap-1.5 px-4 py-2 text-[13px] cursor-pointer transition-none shrink-0 border-r border-sidebar-border group"
                :class="[
                  tab.isActive
                    ? 'bg-background text-foreground border-t-[1.5px] border-t-primary'
                    : 'text-muted-foreground hover:bg-sidebar bg-sidebar hover:text-foreground border-t-[1.5px] border-t-transparent',
                  tab.isTemporary ? 'italic' : ''
                ]"
                @click="setActive(tab.path)"
                @dblclick="makePermanent(tab.path, $event)"
              >
                <FileText class="w-3.5 h-3.5 shrink-0" :class="tab.isActive ? 'text-primary' : 'text-muted-foreground/70'" />
                <span class="truncate max-w-24 font-medium">{{ getTabName(tab.path) }}</span>
                <div class="ml-1 relative w-4 h-4 flex items-center justify-center shrink-0">
                  <div
                    v-if="tab.isDirty"
                    class="w-2 h-2 rounded-full bg-blue-500 absolute transition-opacity group-hover:opacity-0"
                  ></div>
                  <button
                    class="p-0.5 rounded-sm hover:bg-muted/80 absolute transition-opacity"
                    :class="[
                      tab.isActive && !tab.isDirty ? 'opacity-100 text-muted-foreground hover:text-foreground' : 'opacity-0 group-hover:opacity-100'
                    ]"
                    @click="closeTab(tab.path, $event)"
                  >
                    <X class="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              class="max-w-xs"
            >
              <p class="font-mono text-xs">
                {{ tab.path }}
                <span
                  v-if="tab.isTemporary"
                  class="text-muted-foreground ml-1"
                >(临时)</span>
              </p>
              <p
                v-if="tab.isTemporary"
                class="text-xs text-muted-foreground mt-1"
              >
                双击变为永久
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <!-- Tab content -->
      <div
        v-for="tab in znodeTabsStore.znodeTabs"
        v-show="tab.isActive"
        :key="tab.path"
        class="flex-1 overflow-hidden"
      >
        <DataInspector :tab="tab" />
      </div>
    </div>
    <div
      v-else
      class="h-full flex items-center justify-center text-muted-foreground text-sm"
    >
      {{ t('tabs.selectNode') }}
    </div>
  </div>
</template>