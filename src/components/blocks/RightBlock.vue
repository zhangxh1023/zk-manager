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
      <div class="flex shrink-0 border-b bg-muted/30 overflow-x-auto">
        <TooltipProvider
          v-for="tab in znodeTabsStore.znodeTabs"
          :key="tab.path"
        >
          <Tooltip>
            <TooltipTrigger as-child>
              <div
                class="flex items-center gap-1.5 px-3 py-2 text-sm cursor-pointer transition-colors shrink-0 border-r border-border/50"
                :class="[
                  tab.isActive
                    ? 'bg-background text-foreground'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                  tab.isTemporary ? 'italic' : ''
                ]"
                @click="setActive(tab.path)"
                @dblclick="makePermanent(tab.path, $event)"
              >
                <FileText class="w-3.5 h-3.5 shrink-0" />
                <span class="truncate max-w-24">{{ getTabName(tab.path) }}</span>
                <button
                  class="ml-1 p-0.5 rounded hover:bg-destructive/10 hover:text-destructive shrink-0"
                  @click="closeTab(tab.path, $event)"
                >
                  <X class="w-3 h-3" />
                </button>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" class="max-w-xs">
              <p class="font-mono text-xs">
                {{ tab.path }}
                <span v-if="tab.isTemporary" class="text-muted-foreground ml-1">(临时)</span>
              </p>
              <p v-if="tab.isTemporary" class="text-xs text-muted-foreground mt-1">双击变为永久</p>
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