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

  const addConnection = async (conn: Connection) => {
    const db = await getDb();
    await db.execute(
      `INSERT INTO connections (
        uuid, name, url, username, password, use_ssh, ssh_host, ssh_port, ssh_username, ssh_auth_method, ssh_password, ssh_key_path
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        conn.uuid,
        conn.name,
        conn.url,
        conn.username || null,
        conn.password || null,
        conn.use_ssh ? 1 : 0,
        conn.use_ssh ? conn.ssh_host : null,
        conn.use_ssh ? conn.ssh_port : null,
        conn.use_ssh ? conn.ssh_username : null,
        conn.use_ssh ? conn.ssh_auth_method : null,
        conn.use_ssh && conn.ssh_auth_method === 'password' ? conn.ssh_password : null,
        conn.use_ssh && conn.ssh_auth_method === 'key' ? conn.ssh_key_path : null,
      ],
    );
    await reloadConnections();
  };

  const updateConnection = async (conn: Connection) => {
    const db = await getDb();
    await db.execute(
      `UPDATE connections SET
        name = $1,
        url = $2,
        username = $3,
        password = $4,
        use_ssh = $5,
        ssh_host = $6,
        ssh_port = $7,
        ssh_username = $8,
        ssh_auth_method = $9,
        ssh_password = $10,
        ssh_key_path = $11
      WHERE uuid = $12`,
      [
        conn.name,
        conn.url,
        conn.username || null,
        conn.password || null,
        conn.use_ssh ? 1 : 0,
        conn.use_ssh ? conn.ssh_host : null,
        conn.use_ssh ? conn.ssh_port : null,
        conn.use_ssh ? conn.ssh_username : null,
        conn.use_ssh ? conn.ssh_auth_method : null,
        conn.use_ssh && conn.ssh_auth_method === 'password' ? conn.ssh_password : null,
        conn.use_ssh && conn.ssh_auth_method === 'key' ? conn.ssh_key_path : null,
        conn.uuid,
      ],
    );
    await reloadConnections();
  };

  const removeConnection = async (uuid: string) => {
    const db = await getDb();
    await db.execute('DELETE FROM connections WHERE uuid = $1', [uuid]);
    await reloadConnections();
  };

  return { connections, reloadConnections, addConnection, updateConnection, removeConnection };
});