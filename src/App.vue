<script setup lang="ts">
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from './components/ui/resizable';
import Left from './components/blocks/LeftBlock.vue';
import Right from './components/blocks/RightBlock.vue';
import Top from './components/blocks/TopBlock.vue';
</script>

<template>
  <!-- 布局容器：占满全屏 -->
  <div class="flex h-screen w-full flex-col">
    <Top />
    <div class="flex-1">
      <ResizablePanelGroup
        direction="horizontal"
        class="h-full w-full"
      >
        <ResizablePanel :default-size="20">
          <Left />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel :default-size="80">
          <Right />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  </div>
</template>

<style></style>