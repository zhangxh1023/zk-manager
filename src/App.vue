<script setup lang="ts">
import { onMounted } from 'vue';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from './components/ui/resizable';
import LeftBolck from './components/blocks/LeftBlock.vue';
import RightBlock from './components/blocks/RightBlock.vue';
import { useConnectionsStore } from './stores/connections';
import { useSettingsStore } from './stores/settings';
import { useI18n } from 'vue-i18n';
import { Toaster } from './components/ui/sonner';
import 'vue-sonner/style.css';

const connectionsStore = useConnectionsStore();
const settingsStore = useSettingsStore();
const { locale } = useI18n();

onMounted(async () => {
  await settingsStore.load();
  locale.value = settingsStore.settings.language;
  connectionsStore.reloadConnections();
});
</script>

<template>
  <div class="flex h-screen w-full flex-col">
    <ResizablePanelGroup
      direction="horizontal"
      class="h-full w-full"
    >
      <ResizablePanel :default-size="20">
        <LeftBolck />
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel :default-size="80">
        <RightBlock />
      </ResizablePanel>
    </ResizablePanelGroup>
    <Toaster position="bottom-right" />
  </div>
</template>

<style></style>