import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getDb } from '../db/db';

export interface Connection {
  uuid: string;
  name: string;
  url: string;
}

export const useConnectionsStore = defineStore('connections', () => {
  const connections = ref<Connection[]>([]);

  const reloadConnections = async () => {
    const db = await getDb();
    const result = await db.select<{ uuid: string; url: string; name: string }[]>(
      'SELECT * FROM connections',
    );
    connections.value = result.map(item => ({
      uuid: item.uuid,
      url: item.url,
      name: item.name,
    }));
  };

  return { connections, reloadConnections };
});