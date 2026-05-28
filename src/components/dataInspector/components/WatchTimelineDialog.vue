<script setup lang="ts">
import { computed } from 'vue';
import { Search } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { Input } from '../../ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import type { StatRow, WatchTimelineEntry } from '../types';
import {
  getTimelineKindClass,
  getTimelineListPreview,
} from '../utils';
import { formatDateTime24 } from '../../../lib/utils';

const props = defineProps<{
  filteredTimelineEntries: WatchTimelineEntry[];
  open: boolean;
  selectedTimelineEntry: WatchTimelineEntry | null;
  selectedTimelineStatRows: StatRow[];
  timelineQuery: string;
  timelineStatusText: string;
  watchTimeline: WatchTimelineEntry[];
}>();

const emit = defineEmits<{
  (e: 'select-entry', id: number): void;
  (e: 'update:open', value: boolean): void;
  (e: 'update:timelineQuery', value: string): void;
}>();

const { t } = useI18n();

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
});

const timelineQueryModel = computed({
  get: () => props.timelineQuery,
  set: value => emit('update:timelineQuery', value),
});

const getTimelineKindLabel = (kind: WatchTimelineEntry['kind']) =>
  t(`watchTimeline.kind.${kind}`);
</script>

<template>
  <Dialog v-model:open="openModel">
    <DialogContent class="flex h-[70vh] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
      <DialogHeader class="border-b border-sidebar-border/50 px-4 py-3">
        <DialogTitle>{{ t('watchTimeline.title') }}</DialogTitle>
        <p class="text-xs text-muted-foreground">
          {{ timelineStatusText }}
        </p>
      </DialogHeader>

      <div class="flex items-center justify-between gap-3 border-b border-sidebar-border/50 px-4 py-3">
        <div class="relative min-w-0 flex-1 max-w-sm">
          <Search class="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            v-model="timelineQueryModel"
            :placeholder="t('watchTimeline.searchPlaceholder')"
            class="h-8 pl-8 text-xs"
          />
        </div>
        <span class="shrink-0 text-xs text-muted-foreground">
          {{ t('watchTimeline.count', { count: watchTimeline.length }) }}
        </span>
      </div>

      <div
        v-if="!watchTimeline.length"
        class="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground"
      >
        {{ t('watchTimeline.empty') }}
      </div>
      <div
        v-else-if="!filteredTimelineEntries.length"
        class="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground"
      >
        {{ t('watchTimeline.noMatches') }}
      </div>
      <div
        v-else
        class="grid flex-1 grid-cols-[240px_minmax(0,1fr)] min-h-0"
      >
        <div class="min-h-0 overflow-auto border-r border-sidebar-border/50 bg-sidebar-accent/5">
          <button
            v-for="entry in filteredTimelineEntries"
            :key="entry.id"
            type="button"
            class="block w-full border-b border-l-2 border-sidebar-border/40 px-3 py-3 text-left transition-colors"
            :class="selectedTimelineEntry?.id === entry.id ? 'border-l-primary bg-primary/10' : 'border-l-transparent hover:bg-background/70'"
            @click="emit('select-entry', entry.id)"
          >
            <p
              class="line-clamp-3 break-all font-mono text-xs leading-5 text-foreground"
              :title="entry.dataPreview || t('watchTimeline.emptyValue')"
            >
              {{ getTimelineListPreview(entry, t('watchTimeline.emptyValue')) }}
            </p>
            <p class="mt-2 text-[11px] text-muted-foreground">
              {{ formatDateTime24(entry.observedAt) }}
            </p>
          </button>
        </div>

        <div
          v-if="selectedTimelineEntry"
          class="min-h-0 overflow-auto p-4"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span
              class="rounded-full border px-2 py-0.5 text-xs font-medium"
              :class="getTimelineKindClass(selectedTimelineEntry.kind)"
            >
              {{ getTimelineKindLabel(selectedTimelineEntry.kind) }}
            </span>
            <span class="font-mono text-xs text-muted-foreground">
              {{ formatDateTime24(selectedTimelineEntry.observedAt) }}
            </span>
            <span class="font-mono text-xs text-muted-foreground">
              {{ selectedTimelineEntry.eventType }}
            </span>
          </div>

          <div class="mt-4 space-y-4">
            <section>
              <div class="mb-2 flex items-center justify-between gap-2">
                <h3 class="text-xs font-semibold uppercase text-muted-foreground">
                  {{ t('watchTimeline.data') }}
                </h3>
                <span class="text-xs text-muted-foreground">
                  {{ t('watchTimeline.dataLength', { length: selectedTimelineEntry.dataLength ?? '-' }) }}
                </span>
              </div>
              <pre class="max-h-56 overflow-auto rounded border border-sidebar-border/60 bg-sidebar-accent/10 p-3 text-xs whitespace-pre-wrap break-words">{{ selectedTimelineEntry.dataPreview }}</pre>
              <p
                v-if="selectedTimelineEntry.dataTruncated"
                class="mt-1 text-xs text-muted-foreground"
              >
                {{ t('watchTimeline.truncated') }}
              </p>
            </section>

            <section>
              <h3 class="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                {{ t('watchTimeline.acl') }}
              </h3>
              <div
                v-if="selectedTimelineEntry.acl.length"
                class="space-y-2"
              >
                <div
                  v-for="(acl, index) in selectedTimelineEntry.acl"
                  :key="`${acl.scheme}-${acl.id}-${index}`"
                  class="rounded border border-sidebar-border/60 px-3 py-2 text-xs"
                >
                  <div><span class="font-medium">{{ t('acl.scheme') }}:</span> {{ acl.scheme }}</div>
                  <div><span class="font-medium">{{ t('acl.id') }}:</span> {{ acl.id }}</div>
                  <div><span class="font-medium">{{ t('acl.permission') }}:</span> {{ acl.permission }}</div>
                </div>
              </div>
              <p
                v-else
                class="text-xs text-muted-foreground"
              >
                {{ t('watchTimeline.noAcl') }}
              </p>
            </section>

            <section>
              <h3 class="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                {{ t('watchTimeline.meta') }}
              </h3>
              <div
                v-if="selectedTimelineStatRows.length"
                class="grid grid-cols-2 gap-2"
              >
                <div
                  v-for="[label, value] in selectedTimelineStatRows"
                  :key="label"
                  class="rounded border border-sidebar-border/60 px-3 py-2 text-xs"
                >
                  <div class="font-medium text-muted-foreground">
                    {{ t(`meta.${label}`) || label }}
                  </div>
                  <div class="mt-1 break-all font-mono">
                    {{ value }}
                  </div>
                </div>
              </div>
              <p
                v-else
                class="text-xs text-muted-foreground"
              >
                {{ t('watchTimeline.noMeta') }}
              </p>
            </section>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
