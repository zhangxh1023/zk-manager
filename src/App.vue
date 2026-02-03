<script setup lang="ts">
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from './components/ui/resizable';
import LeftBolck from './components/blocks/LeftBlock.vue';
import RightBlock from './components/blocks/RightBlock.vue';
import { useConnectionsStore } from './stores/connections';

const connectionsStore = useConnectionsStore();
connectionsStore.reloadConnections();

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
  </div>
</template>

<style></style>