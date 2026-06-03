<script setup lang="ts">
import { Check, Clock3, Copy, Download, Eye, EyeOff, Plus, RefreshCw, Trash2, Upload } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { Button } from '../../ui/button';
import type { ZnodeTab } from '../../../stores/znodeTabs';
import { getNodeName } from '../utils';

defineProps<{
  tab: ZnodeTab;
  copiedPath: boolean;
  isSubmitting: boolean;
  isWatching: boolean;
  timelineChangeCount: number;
}>();

const emit = defineEmits<{
  (e: 'copy-path'): void;
  (e: 'export-node-data'): void;
  (e: 'import-node-data'): void;
  (e: 'open-create'): void;
  (e: 'open-delete'): void;
  (e: 'open-timeline'): void;
  (e: 'refresh'): void;
  (e: 'toggle-watch'): void;
}>();

const { t } = useI18n();
</script>

<template>
  <div class="flex items-center justify-between p-4 bg-sidebar-accent/10 border-b border-sidebar-border transition-colors">
    <div class="flex flex-col gap-1 min-w-0">
      <h2 class="text-base font-semibold tracking-tight truncate flex items-center gap-2">
        {{ getNodeName(tab.path) }}
        <span class="text-xs font-medium text-muted-foreground px-1.5 py-0.5 rounded-md bg-sidebar-accent border border-sidebar-border/50">Node</span>
      </h2>
      <div
        class="text-xs text-muted-foreground font-mono leading-5 opacity-80 min-w-0 max-w-full"
        :title="tab.path"
      >
        <span class="text-primary/70 select-none font-bold leading-5 align-middle">PATH</span>
        <span class="break-all whitespace-normal leading-5 align-middle ml-1">{{ tab.path }}</span>
        <Button
          :aria-label="t('node.copyPath')"
          :title="t('node.copyPath')"
          variant="ghost"
          size="icon"
          class="inline-flex align-middle ml-1 h-5 w-5 text-muted-foreground hover:text-foreground"
          @click="emit('copy-path')"
        >
          <Check
            v-if="copiedPath"
            class="size-3.5 text-green-500"
          />
          <Copy
            v-else
            class="size-3.5"
          />
        </Button>
      </div>
    </div>
    <div class="flex items-center gap-1.5 shrink-0">
      <Button
        variant="outline"
        size="sm"
        :disabled="isSubmitting || tab.isDeleted"
        class="h-7 px-2.5 shadow-sm text-xs border-sidebar-border"
        @click="emit('refresh')"
      >
        <RefreshCw class="size-3 mr-1.5" /> {{ t('tabs.refresh') }}
      </Button>
      <Button
        variant="outline"
        size="sm"
        :disabled="tab.isDeleted"
        class="h-7 px-2.5 shadow-sm text-xs border-sidebar-border"
        :class="isWatching ? 'bg-green-500/10 text-green-600 border-green-500/30 dark:text-green-400 dark:border-green-500/30' : ''"
        @click="emit('toggle-watch')"
      >
        <EyeOff
          v-if="isWatching"
          class="size-3 mr-1.5"
        />
        <Eye
          v-else
          class="size-3 mr-1.5"
        />
        {{ isWatching ? t('tabs.unwatch') : t('tabs.watch') }}
      </Button>
      <Button
        variant="outline"
        size="sm"
        class="h-7 px-2.5 shadow-sm text-xs border-sidebar-border"
        @click="emit('open-timeline')"
      >
        <Clock3 class="size-3 mr-1.5" />
        {{ t('watchTimeline.button') }}
        <span
          v-if="timelineChangeCount"
          class="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] leading-none text-primary"
        >
          {{ timelineChangeCount }}
        </span>
      </Button>
      <div class="w-[1px] h-4 bg-sidebar-border mx-1" />
      <Button
        :aria-label="t('node.importData')"
        :title="t('node.importData')"
        variant="ghost"
        size="icon"
        :disabled="isSubmitting || tab.isDeleted"
        class="h-7 w-7 text-muted-foreground hover:text-foreground"
        @click="emit('import-node-data')"
      >
        <Upload class="size-4" />
      </Button>
      <Button
        :aria-label="t('node.exportData')"
        :title="t('node.exportData')"
        variant="ghost"
        size="icon"
        :disabled="isSubmitting || tab.isDeleted"
        class="h-7 w-7 text-muted-foreground hover:text-foreground"
        @click="emit('export-node-data')"
      >
        <Download class="size-4" />
      </Button>
      <Button
        :aria-label="t('node.createChild')"
        variant="ghost"
        size="icon"
        :disabled="isSubmitting || tab.isDeleted"
        class="h-7 w-7 text-muted-foreground hover:text-foreground"
        @click="emit('open-create')"
      >
        <Plus class="size-4" />
      </Button>
      <Button
        :aria-label="t('node.delete')"
        variant="ghost"
        size="icon"
        :disabled="isSubmitting || tab.isDeleted"
        class="h-7 w-7 text-muted-foreground hover:text-destructive"
        @click="emit('open-delete')"
      >
        <Trash2 class="size-4" />
      </Button>
    </div>
  </div>
</template>
