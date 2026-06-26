<script setup lang="ts">
import { computed, toRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import type { ZnodeTab } from '../../stores/znodeTabs';
import AclEditDialog from './components/AclEditDialog.vue';
import AclTabPanel from './components/AclTabPanel.vue';
import ConfirmDeleteDialog from './components/ConfirmDeleteDialog.vue';
import DataInspectorHeader from './components/DataInspectorHeader.vue';
import DataTabPanel from './components/DataTabPanel.vue';
import MetaTabPanel from './components/MetaTabPanel.vue';
import WatchTimelineDialog from './components/WatchTimelineDialog.vue';
import { useAclEditor } from './composables/useAclEditor';
import { useDataEditor } from './composables/useDataEditor';
import { useNodeActions } from './composables/useNodeActions';
import { useWatchTimeline } from './composables/useWatchTimeline';
import { getStatRows } from './utils';

const props = defineProps<{
  tab: ZnodeTab;
}>();

const { t } = useI18n();
const tabRef = toRef(props, 'tab');

const {
  dataFormat,
  editValue,
  format,
  formatOptions,
  hasUnsavedChanges,
  isDirty,
  isSubmitting,
  save,
} = useDataEditor(tabRef);

const {
  copiedPath,
  copyPath,
  refresh,
} = useNodeActions(
  tabRef,
  hasUnsavedChanges,
  isSubmitting,
);

const {
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
} = useWatchTimeline(tabRef, hasUnsavedChanges);

const {
  addNewAcl,
  allPermissionsSelected,
  confirmDeleteAcl,
  deleteAcl,
  editingAcl,
  openEditAcl,
  permissionOptions,
  schemeHint,
  schemeOptions,
  selectedPermissions,
  showAclDeleteDialog,
  showAclDialog,
  toggleAclPermission,
  toggleAllAclPermissions,
  updateAclField,
  validateAndSaveAcl,
} = useAclEditor(tabRef, isSubmitting);

const statRows = computed(() => getStatRows(tabRef.value.stat));

watch(isDirty, (dirty) => {
  if (!dirty) {
    resetDirtyUpdateNotification();
  }
});
</script>

<template>
  <div class="h-full flex flex-col bg-background">
    <DataInspectorHeader
      :tab="tab"
      :copied-path="copiedPath"
      :is-submitting="isSubmitting"
      :is-watching="isWatching"
      :timeline-change-count="timelineChangeCount"
      @copy-path="copyPath"
      @open-timeline="openTimelineDialog"
      @refresh="refresh"
      @toggle-watch="toggleWatch"
    />

    <Tabs
      default-value="Data"
      class="flex-1 overflow-hidden flex flex-col"
    >
      <div class="px-4 pt-3 border-b border-sidebar-border/50">
        <TabsList class="w-[300px] h-9 grid grid-cols-3 bg-sidebar-accent/50 p-1">
          <TabsTrigger
            value="Data"
            class="text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            {{ t('tabs.data') }}
          </TabsTrigger>
          <TabsTrigger
            value="ACL"
            class="text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            {{ t('tabs.acl') }}
          </TabsTrigger>
          <TabsTrigger
            value="Meta"
            class="text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            {{ t('tabs.meta') }}
          </TabsTrigger>
        </TabsList>
      </div>

      <DataTabPanel
        v-model:data-format="dataFormat"
        v-model:edit-value="editValue"
        :format-options="formatOptions"
        :is-submitting="isSubmitting"
        @format="format"
        @save="save"
      />
      <AclTabPanel
        :acl="tab.acl"
        @add="addNewAcl"
        @delete="confirmDeleteAcl"
        @edit="openEditAcl"
      />
      <MetaTabPanel :rows="statRows" />
    </Tabs>

    <WatchTimelineDialog
      v-model:open="showTimelineDialog"
      v-model:timeline-query="timelineQuery"
      :filtered-timeline-entries="filteredTimelineEntries"
      :selected-timeline-entry="selectedTimelineEntry"
      :selected-timeline-stat-rows="selectedTimelineStatRows"
      :timeline-status-text="timelineStatusText"
      :watch-timeline="watchTimeline"
      @select-entry="selectedTimelineId = $event"
    />

    <AclEditDialog
      v-model:open="showAclDialog"
      :all-permissions-selected="allPermissionsSelected"
      :editing-acl="editingAcl"
      :is-submitting="isSubmitting"
      :permission-options="permissionOptions"
      :scheme-hint="schemeHint"
      :scheme-options="schemeOptions"
      :selected-permissions="selectedPermissions"
      @save="validateAndSaveAcl"
      @toggle-all-permissions="toggleAllAclPermissions"
      @toggle-permission="toggleAclPermission"
      @update-acl-field="updateAclField"
    />

    <ConfirmDeleteDialog
      v-model:open="showAclDeleteDialog"
      :cancel-text="t('connection.cancel')"
      :confirm-text="t('acl.delete')"
      :is-submitting="isSubmitting"
      :message="t('acl.confirmDelete')"
      :title="t('acl.delete')"
      content-class="max-w-sm"
      small
      @confirm="deleteAcl"
    />
  </div>
</template>
