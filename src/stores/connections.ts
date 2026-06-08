import { defineStore } from 'pinia';
import { ref } from 'vue';
import { appDataApi } from '../api/appData';
import { zkApi } from '../api/zk';
import { secretsApi } from '../api/secrets';
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
  sort_order?: number;
}

type ConnectionSecrets = Partial<Pick<Connection, 'password' | 'ssh_password'>>;

type LoadConnectionSecretsOptions = {
  password?: boolean;
  sshPassword?: boolean;
};

type ConnectConnectionOptions = {
  trustUnknownSshHostKey?: boolean;
};

const normalizeSecrets = (secrets: ConnectionSecrets): ConnectionSecrets => ({
  password: secrets.password || undefined,
  ssh_password: secrets.ssh_password || undefined,
});

export const useConnectionsStore = defineStore('connections', () => {
  const connections = ref<Connection[]>([]);
  const connectedSet = ref<Set<string>>(new Set());
  const connectingSet = ref<Set<string>>(new Set());
  const expandedSet = ref<Set<string>>(new Set());
  const secretCache = new Map<string, ConnectionSecrets>();

  const saveConnectionSecrets = async (conn: Connection) => {
    const secrets = normalizeSecrets({
      password: conn.password,
      ssh_password: conn.use_ssh && conn.ssh_auth_method === 'password'
        ? conn.ssh_password
        : undefined,
    });
    await secretsApi.setConnectionSecrets(conn.uuid, {
      password: secrets.password || null,
      sshPassword: secrets.ssh_password || null,
    });
    secretCache.set(conn.uuid, secrets);
  };

  const reloadConnections = async () => {
    const result = await appDataApi.listConnections();
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
      sort_order: item.sort_order,
    }));
  };

  const loadConnectionSecrets = async (
    uuid: string,
    options: LoadConnectionSecretsOptions = { password: true, sshPassword: true },
  ): Promise<ConnectionSecrets> => {
    let savedSecrets = secretCache.get(uuid);
    if (!savedSecrets) {
      const keychainSecrets = await secretsApi.getConnectionSecrets(uuid);
      savedSecrets = normalizeSecrets({
        password: keychainSecrets.password || undefined,
        ssh_password: keychainSecrets.sshPassword || undefined,
      });
      secretCache.set(uuid, savedSecrets);
    }
    const secrets: ConnectionSecrets = {};
    if (options.password) {
      secrets.password = savedSecrets.password || undefined;
    }
    if (options.sshPassword) {
      secrets.ssh_password = savedSecrets.ssh_password || undefined;
    }
    return secrets;
  };

  const addConnection = async (conn: Connection) => {
    await saveConnectionSecrets(conn);
    try {
      await appDataApi.insertConnection(conn);
    } catch (error) {
      secretCache.delete(conn.uuid);
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
    secretCache.delete(uuid);
    await reloadConnections();
  };

  const reorderConnections = async (orderedUuids: string[]) => {
    const previousConnections = connections.value;
    const orderedUuidSet = new Set(orderedUuids);
    const connectionsByUuid = new Map(connections.value.map(conn => [conn.uuid, conn]));
    const reorderedConnections = orderedUuids
      .map(uuid => connectionsByUuid.get(uuid))
      .filter((conn): conn is Connection => Boolean(conn));
    const remainingConnections = connections.value.filter(conn => !orderedUuidSet.has(conn.uuid));

    connections.value = [...reorderedConnections, ...remainingConnections].map((conn, index) => ({
      ...conn,
      sort_order: index,
    }));

    try {
      await appDataApi.reorderConnections(connections.value.map(conn => conn.uuid));
    } catch (error) {
      connections.value = previousConnections;
      throw error;
    }
  };

  const isConnected = (uuid: string) => connectedSet.value.has(uuid);
  const isConnecting = (uuid: string) => connectingSet.value.has(uuid);
  const isExpanded = (uuid: string) => expandedSet.value.has(uuid);

  const connectConnection = async (conn: Connection, options: ConnectConnectionOptions = {}) => {
    const logsStore = useLogsStore();
    console.info('connection:load_secrets:start', conn.uuid);
    const secrets = await loadConnectionSecrets(conn.uuid, {
      password: Boolean(conn.username),
      sshPassword: Boolean(conn.use_ssh && conn.ssh_auth_method !== 'key'),
    });
    console.info('connection:load_secrets:done', conn.uuid);
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
        options.trustUnknownSshHostKey,
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

  const toggleConnection = async (conn: Connection, options: ConnectConnectionOptions = {}) => {
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
      await connectConnection(conn, options);
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
    reorderConnections,
    isConnected,
    isConnecting,
    isExpanded,
    connectConnection,
    disconnectConnection,
    toggleConnection,
    forgetConnectionState,
  };
});
