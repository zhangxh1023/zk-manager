<script setup lang="ts">
import { useDataStore } from '../../stores/data';
import type { ZkNodeInfo, ZkNodeList } from '../../types/nodes';
import { ref } from 'vue';
import { Item } from '../ui/item';
import { Command, invoke } from '../../utils/tauri';

defineProps<{
  connectionUuid: string;
}>();

// const getData = async (item: string) => {
//   const data = await invoke('get_data', { path: '/' + item });
// }

let rootNodes: ZkNodeList = [];
const localNodes = ref<ZkNodeList>([]);

const fetchRoot = async () => {
  console.log('开始加载 nodes list');
  const value: string[] = await invoke(Command.list_children, { path: '/' });
  rootNodes = [];
  for (const item of value) {
    rootNodes.push({
      parentPath: '/',
      name: item,
      nodes: [],
    });
  }
  localNodes.value = rootNodes;
}

defineExpose({
  fetchRoot,
});

const findParent = (parentNodes: ZkNodeList, childNode: ZkNodeInfo): ZkNodeList => {
  console.log(parentNodes);
  console.log(childNode);
  for (const node of parentNodes) {
    for (const item of node.nodes) {
      if (item.name === childNode.name && item.parentPath === childNode.parentPath) {
        console.log(item, childNode);
        return parentNodes;
      }
    }
    const ret = findParent(node.nodes, childNode);
    if (ret.length) return ret;
  }
  return [];
}

const fetchChildren = async (node: ZkNodeInfo) => {
  if (node.name === '../') {
    const ret = findParent(rootNodes, node);
    if (ret) {
      localNodes.value = [...ret];
    }
    return;
  }
  const clickPath = node.parentPath === '/'
    ? '/' + node.name
    : node.parentPath + '/' + node.name;
  const data: number[] = await invoke(Command.get_data, {
    path: clickPath,
  });
  const dataStore = useDataStore();
  dataStore.setData(data);

  const value: string[] = await invoke(Command.list_children, {
    path: clickPath,
  });
  node.nodes = [];
  node.nodes.push({
    parentPath: node.parentPath === '/' ? '/' + node.name : node.parentPath + '/' + node.name,
    name: '../',
    nodes: [],
  });
  for (const item of value) {
    node.nodes.push({
      parentPath: node.parentPath === '/' ? '/' + node.name : node.parentPath + '/' + node.name,
      name: item,
      nodes: [],
    });
  }
  localNodes.value = node.nodes;
}
</script>

<template>
  <Item
    v-for="node in localNodes"
    :key="node.parentPath + '/' + node.name"
    size="sm"
    as-child
  >
    <a
      href="#"
      @click.prevent="fetchChildren(node)"
    >
      <ItemContent>
        <ItemTitle>{{ node.name }}</ItemTitle>
      </ItemContent>
    </a>
  </Item>
</template>