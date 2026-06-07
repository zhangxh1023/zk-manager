<script setup lang="ts">
import { Check, Clock3, Copy, Eye, EyeOff, RefreshCw } from 'lucide-vue-next';
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
    </div>
  </div>
</template>
