import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getDb } from '../db/db';

export interface Connection {
  uuid: string;
  name: string;
  url: string;
  username?: string;
  password?: string;
  use_ssh?: boolean;
  ssh_host?: string;
  ssh_port?: number;
  ssh_username?: string;
  ssh_auth_method?: string;
  ssh_password?: string;
  ssh_key_path?: string;
}

interface DbConnectionRow {
  uuid: string;
  name: string;
  url: string;
  username: string | null;
  password: string | null;
  use_ssh: number;
  ssh_host: string | null;
  ssh_port: number | null;
  ssh_username: string | null;
  ssh_auth_method: string | null;
  ssh_password: string | null;
  ssh_key_path: string | null;
}

export const useConnectionsStore = defineStore('connections', () => {
  const connections = ref<Connection[]>([]);

  const reloadConnections = async () => {
    const db = await getDb();
    const result = await db.select<DbConnectionRow[]>('SELECT * FROM connections');
    connections.value = result.map(item => ({
      uuid: item.uuid,
      url: item.url,
      name: item.name,
      username: item.username || undefined,
      password: item.password || undefined,
      use_ssh: item.use_ssh === 1,
      ssh_host: item.ssh_host || undefined,
      ssh_port: item.ssh_port || undefined,
      ssh_username: item.ssh_username || undefined,
      ssh_auth_method: item.ssh_auth_method || undefined,
      ssh_password: item.ssh_password || undefined,
      ssh_key_path: item.ssh_key_path || undefined,
    }));
  };

  return { connections, reloadConnections };
});