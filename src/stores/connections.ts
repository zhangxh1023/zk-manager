import { defineStore } from 'pinia';
import { ref } from 'vue';
import { appDataApi } from '../api/appData';
import { zkApi } from '../api/zk';
import { secretsApi, type ConnectionSecretKey } from '../api/secrets';
import { useLogsStore } from './logs';
import { getErrorMessage } from '../utils/errors';

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

type ConnectionSecrets = Pick<Connection, 'password' | 'ssh_password'>;

export const useConnectionsStore = defineStore('connections', () => {
  const connections = ref<Connection[]>([]);
  const connectedSet = ref<Set<string>>(new Set());
  const connectingSet = ref<Set<string>>(new Set());
  const expandedSet = ref<Set<string>>(new Set());

  const clearLegacySecret = async (uuid: string, secretKey: ConnectionSecretKey) => {
    await appDataApi.clearLegacyConnectionSecret(uuid, secretKey);
  };

  const migrateLegacySecret = async (
    uuid: string,
    secretKey: ConnectionSecretKey,
    legacySecret: string | null,
  ) => {
    if (!legacySecret) return;
    try {
      const existingSecret = await secretsApi.getConnectionSecret(uuid, secretKey);
      if (!existingSecret) {
        await secretsApi.setConnectionSecret(uuid, secretKey, legacySecret);
      }
      await clearLegacySecret(uuid, secretKey);
    } catch (error) {
      console.warn(`Failed to migrate ${secretKey} to system keychain:`, error);
    }
  };

  const readSecret = async (
    uuid: string,
    secretKey: ConnectionSecretKey,
    legacySecret: string | null,
  ): Promise<string | undefined> => {
    try {
      const secret = await secretsApi.getConnectionSecret(uuid, secretKey);
      if (secret) return secret;
      if (legacySecret) {
        await secretsApi.setConnectionSecret(uuid, secretKey, legacySecret);
        await clearLegacySecret(uuid, secretKey);
        return legacySecret;
      }
    } catch (error) {
      if (legacySecret) return legacySecret;
      console.warn(`Failed to read ${secretKey} from system keychain:`, error);
    }
    return undefined;
  };

  const saveConnectionSecrets = async (conn: Connection) => {
    if (conn.password) {
      await secretsApi.setConnectionSecret(conn.uuid, 'password', conn.password);
    } else {
      await secretsApi.setConnectionSecret(conn.uuid, 'password', null).catch(error => {
        console.warn('Failed to delete ZK password from system keychain:', error);
      });
    }

    if (conn.use_ssh && conn.ssh_auth_method === 'password' && conn.ssh_password) {
      await secretsApi.setConnectionSecret(conn.uuid, 'ssh_password', conn.ssh_password);
    } else {
      await secretsApi.setConnectionSecret(conn.uuid, 'ssh_password', null).catch(error => {
        console.warn('Failed to delete SSH password from system keychain:', error);
      });
    }
  };

  const reloadConnections = async () => {
    const result = await appDataApi.listConnections();
    await Promise.all(result.map(async item => {
      await migrateLegacySecret(item.uuid, 'password', item.password);
      await migrateLegacySecret(item.uuid, 'ssh_password', item.ssh_password);
    }));
    connections.value = result.map(item => ({
      uuid: item.uuid,
      url: item.url,
      name: item.name,
      username: item.username || undefined,
      use_ssh: item.use_ssh === 1,
      ssh_host: item.ssh_host || undefined,
      ssh_port: item.ssh_port || undefined,
      ssh_username: item.ssh_username || undefined,
      ssh_auth_method: item.ssh_auth_method || undefined,
      ssh_key_path: item.ssh_key_path || undefined,
    }));
  };

  const loadConnectionSecrets = async (uuid: string): Promise<ConnectionSecrets> => {
    const row = await appDataApi.getConnectionLegacySecrets(uuid);
    return {
      password: await readSecret(uuid, 'password', row?.password ?? null),
      ssh_password: await readSecret(uuid, 'ssh_password', row?.ssh_password ?? null),
    };
  };

  const addConnection = async (conn: Connection) => {
    await saveConnectionSecrets(conn);
    try {
      await appDataApi.insertConnection(conn);
    } catch (error) {
      await secretsApi.deleteConnectionSecrets(conn.uuid).catch(() => {});
      throw error;
    }
    await reloadConnections();
  };

  const updateConnection = async (conn: Connection) => {
    await saveConnectionSecrets(conn);
    await appDataApi.updateConnection(conn);
    await reloadConnections();
  };

  const removeConnection = async (uuid: string) => {
    await appDataApi.deleteConnection(uuid);
    await secretsApi.deleteConnectionSecrets(uuid).catch(error => {
      console.warn('Failed to delete connection secrets from system keychain:', error);
    });
    await reloadConnections();
  };

  const isConnected = (uuid: string) => connectedSet.value.has(uuid);
  const isConnecting = (uuid: string) => connectingSet.value.has(uuid);
  const isExpanded = (uuid: string) => expandedSet.value.has(uuid);

  const connectConnection = async (conn: Connection) => {
    const logsStore = useLogsStore();
    const secrets = await loadConnectionSecrets(conn.uuid);
    try {
      await zkApi.connect(
        conn.uuid,
        conn.url,
        conn.username,
        secrets.password,
        conn.use_ssh,
        conn.ssh_host,
        conn.ssh_port,
        conn.ssh_username,
        conn.ssh_auth_method,
        secrets.ssh_password,
        conn.ssh_key_path,
      );
      connectedSet.value.add(conn.uuid);
      expandedSet.value.add(conn.uuid);
      await logsStore.addLog(conn.name || conn.uuid, 'CONNECT', `Connected to ${conn.url}`, true);
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      await logsStore.addLog(
        conn.name || conn.uuid,
        'CONNECT',
        `Failed to connect to ${conn.url}: ${errorMsg}`,
        false,
      );
      throw error;
    }
  };

  const disconnectConnection = async (conn: Connection) => {
    const logsStore = useLogsStore();
    try {
      await zkApi.disconnect(conn.uuid);
    } catch (error) {
      console.error('Disconnect error:', error);
    }
    connectedSet.value.delete(conn.uuid);
    expandedSet.value.delete(conn.uuid);
    await logsStore.addLog(conn.name || conn.uuid, 'DISCONNECT', `Disconnected from ${conn.url}`);
  };

  const toggleConnection = async (conn: Connection) => {
    if (connectingSet.value.has(conn.uuid)) return;
    if (connectedSet.value.has(conn.uuid)) {
      if (expandedSet.value.has(conn.uuid)) {
        expandedSet.value.delete(conn.uuid);
      } else {
        expandedSet.value.add(conn.uuid);
      }
      return;
    }

    connectingSet.value.add(conn.uuid);
    try {
      await connectConnection(conn);
    } finally {
      connectingSet.value.delete(conn.uuid);
    }
  };

  const forgetConnectionState = (uuid: string) => {
    connectedSet.value.delete(uuid);
    connectingSet.value.delete(uuid);
    expandedSet.value.delete(uuid);
  };

  return {
    connections,
    connectedSet,
    connectingSet,
    expandedSet,
    reloadConnections,
    loadConnectionSecrets,
    addConnection,
    updateConnection,
    removeConnection,
    isConnected,
    isConnecting,
    isExpanded,
    connectConnection,
    disconnectConnection,
    toggleConnection,
    forgetConnectionState,
  };
});
