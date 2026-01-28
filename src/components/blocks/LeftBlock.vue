<script setup lang="ts">
import ZNodes from '../zNodes/ZNodes.vue';
import { Item, ItemActions, ItemContent, ItemTitle } from '../ui/item';
import { ChevronRightIcon } from 'lucide-vue-next';
import { onMounted, reactive, ref } from 'vue';
import { getDb } from '../../db/db';
import type { Connection } from '../../types/connection';
import { Command, invoke } from '../../utils/tauri';

type LocalConnection = (Connection & {
  focus: boolean
});
type LocalConnections = LocalConnection[];

const connectionsRef = ref<LocalConnections>([]);

onMounted(async () => {
  console.log('db query start')
  const db = await getDb();
  const result = await db.select<{ uuid: string, url: string, name: string }[]>('SELECT * FROM connections');
  const connections: LocalConnections = [];
  for (const item of result) {
    connections.push({
      uuid: item.uuid,
      url: item.url,
      name: item.name,
      focus: false,
    });
  }
  connectionsRef.value = connections;
})

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
  <div class="p-1">
    <Item
      v-for="connection in connectionsRef"
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