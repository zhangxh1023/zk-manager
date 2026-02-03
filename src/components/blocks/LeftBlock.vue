<script setup lang="ts">
import ZNodes from '../zNodeList/ZNodeList.vue';
import { Item, ItemActions, ItemContent, ItemTitle } from '../ui/item';
import { ChevronRightIcon } from 'lucide-vue-next';
import { reactive } from 'vue';
import type { Connection } from '../../types/connection';
import { Command, invoke } from '../../utils/tauri';
import { useConnectionsStore } from '../../stores/connections';
import { storeToRefs } from 'pinia';
import AppMenus from '../appMenus/AppMenus.vue';

type LocalConnection = (Connection & {
  focus: boolean
});

const connectionsStore = useConnectionsStore();
const { connections } = storeToRefs(connectionsStore);

type NodesInstance = InstanceType<typeof ZNodes>
const nodesMap = reactive<{ [key: string]: NodesInstance }>({});
const callChild = (uuid: string) => {
  console.log(nodesMap);
  const childInstance = nodesMap[uuid];
  if (childInstance) {
    childInstance.fetchRoot()
  }
}

const connClick = async (connection: LocalConnection) => {
  connection.focus = !connection.focus;
  if (connection.focus) {
    await invoke(Command.connect_zk, { server: connection.url });
    callChild(connection.uuid);
  }
};
</script>

<template>
  <div class="p-2">
    <AppMenus />
    <Item
      v-for="connection in connections"
      :key="connection.uuid"
      as-child
    >
      <a
        href="#"
        @click.prevent="connClick(connection)"
      >
        <ItemActions>
          <ChevronRightIcon
            class="size-4 transition-transform duration-200"
            :class="{ 'rotate-90': connection.focus }"
          />
        </ItemActions>
        <ItemContent>
          <ItemTitle>{{ connection.name }}</ItemTitle>
        </ItemContent>
      </a>
      <div v-show="connection.focus">
        <ZNodes
          :ref="(el: any) => { if (el) nodesMap[connection.uuid] = el }"
          :connection-uuid="connection.uuid"
        />
      </div>
    </Item>
  </div>
</template>