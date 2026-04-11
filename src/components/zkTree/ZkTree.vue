<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { useZkTreeStore } from '../../stores/zkTree';
import TreeNode from './TreeNode.vue';

const props = defineProps<{
  connectionUuid: string;
  connected: boolean;
}>();

const zkTreeStore = useZkTreeStore();

onMounted(async () => {
  if (props.connected) {
    await zkTreeStore.fetchRoot(props.connectionUuid);
  }
});

watch(() => props.connected, async (connected) => {
  if (connected) {
    await zkTreeStore.fetchRoot(props.connectionUuid);
  } else {
    zkTreeStore.clearTree(props.connectionUuid);
  }
});

const nodes = () => zkTreeStore.trees[props.connectionUuid] || [];
</script>

<template>
  <div class="zk-tree text-sm">
    <div v-if="!connected" class="p-2 text-muted-foreground text-xs">
      not connected
    </div>
    <div v-else-if="nodes().length === 0" class="p-2 text-muted-foreground text-xs">
      loading...
    </div>
    <TreeNode
      v-for="node in nodes()"
      :key="node.path"
      :node="node"
      :connection-uuid="connectionUuid"
      :depth="0"
    />
  </div>
</template>