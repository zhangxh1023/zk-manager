import { computed, onMounted, onUnmounted, ref, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { listen } from '@tauri-apps/api/event';
import { zkApi } from '../../../api/zk';
import { useZnodeTabsStore, type ZnodeTab } from '../../../stores/znodeTabs';
import { getErrorMessage } from '../../../utils/errors';
import { showToast } from '../../../utils/toast';
import type {
  WatchEventPayload,
  WatchTimelineEntry,
  WatchTimelineEntryKind,
} from '../types';
import {
  formatTimelineDataPreview,
  getStatRows,
  MAX_TIMELINE_ENTRIES,
} from '../utils';

export const useWatchTimeline = (
  tab: Ref<ZnodeTab>,
  hasUnsavedChanges: () => boolean,
) => {
  const { t } = useI18n();
  const znodeTabsStore = useZnodeTabsStore();

  const isWatching = ref(false);
  const dirtyWatchUpdateNotified = ref(false);
  const showTimelineDialog = ref(false);
  const timelineQuery = ref('');
  const watchTimeline = ref<WatchTimelineEntry[]>([]);
  const selectedTimelineId = ref<number | null>(null);
  let timelineSequence = 0;
  let unlistenWatch: (() => void) | null = null;

  const addWatchTimelineEntry = (
    payload: WatchEventPayload,
    kind: WatchTimelineEntryKind,
  ) => {
    const stat = payload.stat;
    const acl = payload.acl ?? [];
    const dataPreview = formatTimelineDataPreview(payload.data, t('watchTimeline.noData'));
    const entry: WatchTimelineEntry = {
      id: ++timelineSequence,
      observedAt: Date.now(),
      kind,
      eventType: payload.eventType,
      path: payload.path,
      dataLength: payload.data?.length ?? stat?.dataLength ?? null,
      dataPreview: dataPreview.text,
      dataTruncated: dataPreview.truncated,
      stat,
      acl,
    };

    watchTimeline.value.push(entry);
    if (watchTimeline.value.length > MAX_TIMELINE_ENTRIES) {
      watchTimeline.value.splice(0, watchTimeline.value.length - MAX_TIMELINE_ENTRIES);
    }
    if (selectedTimelineId.value === null) {
      selectedTimelineId.value = entry.id;
    }
  };

  const timelineChangeCount = computed(() =>
    watchTimeline.value.filter(entry => entry.kind !== 'initial').length,
  );

  const filteredTimelineEntries = computed(() => {
    const query = timelineQuery.value.trim().toLowerCase();
    const entries = [...watchTimeline.value].reverse();
    if (!query) return entries;
    return entries.filter(entry => entry.dataPreview.toLowerCase().includes(query));
  });

  const selectedTimelineEntry = computed(() => {
    if (!filteredTimelineEntries.value.length) return null;
    return filteredTimelineEntries.value.find(entry => entry.id === selectedTimelineId.value)
      ?? filteredTimelineEntries.value[0];
  });

  const selectedTimelineStatRows = computed(() =>
    getStatRows(selectedTimelineEntry.value?.stat ?? null),
  );

  const openTimelineDialog = () => {
    showTimelineDialog.value = true;
    selectedTimelineId.value = filteredTimelineEntries.value[0]?.id ?? null;
  };

  const timelineStatusText = computed(() => {
    if (isWatching.value) {
      return t('watchTimeline.recording');
    }
    if (watchTimeline.value.length) {
      return t('watchTimeline.paused');
    }
    return t('watchTimeline.emptyHint');
  });

  const buildCurrentSnapshotPayload = (): WatchEventPayload => ({
    connectionUuid: tab.value.connectionUuid,
    path: tab.value.path,
    eventType: 'InitialSnapshot',
    data: [...tab.value.znodeData],
    stat: tab.value.stat ? { ...tab.value.stat } : null,
    acl: tab.value.acl.map(item => ({ ...item })),
  });

  const stopWatch = async () => {
    try {
      await zkApi.unwatchNode(tab.value.connectionUuid, tab.value.path);
    } catch {
      // Ignore unwatch failures during UI cleanup.
    }
    isWatching.value = false;
    znodeTabsStore.setWatching(tab.value.connectionUuid, tab.value.path, false);
    if (unlistenWatch) {
      unlistenWatch();
      unlistenWatch = null;
    }
  };

  const handleWatchEvent = (payload: WatchEventPayload) => {
    if (payload.connectionUuid !== tab.value.connectionUuid || payload.path !== tab.value.path) {
      return;
    }

    if (payload.eventType === 'NodeDeleted') {
      addWatchTimelineEntry(payload, 'deleted');
      isWatching.value = false;
      znodeTabsStore.setDeleted(tab.value.connectionUuid, tab.value.path, true);
      znodeTabsStore.setWatching(tab.value.connectionUuid, tab.value.path, false);
      showToast.error(t('node.deleted'));
      if (unlistenWatch) {
        unlistenWatch();
        unlistenWatch = null;
      }
      return;
    }

    if (payload.data !== null && payload.stat !== null) {
      if (payload.eventType !== 'InitialSnapshot') {
        addWatchTimelineEntry(payload, 'changed');
      }

      if (hasUnsavedChanges()) {
        if (!dirtyWatchUpdateNotified.value) {
          showToast.info(t('watchTimeline.dirtyUpdateSkipped'));
          dirtyWatchUpdateNotified.value = true;
        }
        return;
      }

      znodeTabsStore.updateTab(tab.value.connectionUuid, tab.value.path, {
        znodeData: payload.data,
        stat: payload.stat,
        acl: payload.acl ?? [],
      });
    }
  };

  const startWatch = async () => {
    if (unlistenWatch) {
      unlistenWatch();
      unlistenWatch = null;
    }

    unlistenWatch = await listen('zk:node-changed', (event) => {
      handleWatchEvent(event.payload as WatchEventPayload);
    });

    try {
      await zkApi.watchNode(tab.value.connectionUuid, tab.value.path);
      isWatching.value = true;
      znodeTabsStore.setWatching(tab.value.connectionUuid, tab.value.path, true);
      addWatchTimelineEntry(buildCurrentSnapshotPayload(), 'initial');
    } catch (error) {
      if (unlistenWatch) {
        unlistenWatch();
        unlistenWatch = null;
      }
      throw error;
    }
  };

  const toggleWatch = async () => {
    if (isWatching.value) {
      await stopWatch();
    } else {
      try {
        await startWatch();
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        showToast.error(errorMsg);
      }
    }
  };

  const resetDirtyUpdateNotification = () => {
    dirtyWatchUpdateNotified.value = false;
  };

  onMounted(async () => {
    if (tab.value.isWatching) {
      try {
        await startWatch();
      } catch {
        znodeTabsStore.setWatching(tab.value.connectionUuid, tab.value.path, false);
      }
    }
  });

  onUnmounted(() => {
    if (unlistenWatch) {
      unlistenWatch();
      unlistenWatch = null;
    }
    if (isWatching.value) {
      zkApi.unwatchNode(tab.value.connectionUuid, tab.value.path).catch(() => {});
      znodeTabsStore.setWatching(tab.value.connectionUuid, tab.value.path, false);
    }
  });

  return {
    filteredTimelineEntries,
    isWatching,
    openTimelineDialog,
    resetDirtyUpdateNotification,
    selectedTimelineEntry,
    selectedTimelineId,
    selectedTimelineStatRows,
    showTimelineDialog,
    timelineChangeCount,
    timelineQuery,
    timelineStatusText,
    toggleWatch,
    watchTimeline,
  };
};
