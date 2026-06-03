import type { Connection } from '../stores/connections';

export const CONNECTION_EXPORT_TYPE = 'zk-manager.connections';
export const CONNECTION_EXPORT_VERSION = 1;

export type ExportedConnection = Omit<Connection, 'uuid' | 'password' | 'ssh_password'> & {
  uuid?: string;
  password?: string;
  ssh_password?: string;
};

export interface ConnectionExportFile {
  type: typeof CONNECTION_EXPORT_TYPE;
  version: typeof CONNECTION_EXPORT_VERSION;
  exportedAt: string;
  connections: ExportedConnection[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const optionalString = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const optionalNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const optionalBoolean = (value: unknown) =>
  typeof value === 'boolean' ? value : undefined;

const stripSecrets = (connection: Connection): ExportedConnection => ({
  uuid: connection.uuid,
  name: connection.name || connection.url,
  url: connection.url,
  username: connection.username,
  use_ssh: connection.use_ssh,
  ssh_host: connection.ssh_host,
  ssh_port: connection.ssh_port,
  ssh_username: connection.ssh_username,
  ssh_auth_method: connection.ssh_auth_method,
  ssh_key_path: connection.ssh_key_path,
});

const normalizeConnection = (value: unknown, index: number): ExportedConnection => {
  if (!isRecord(value)) {
    throw new Error(`Connection #${index + 1} is not an object`);
  }

  const url = optionalString(value.url);
  if (!url) {
    throw new Error(`Connection #${index + 1} is missing url`);
  }

  const useSsh = optionalBoolean(value.use_ssh)
    ?? optionalBoolean(value.useSsh)
    ?? false;
  const sshAuthMethod = optionalString(value.ssh_auth_method)
    ?? optionalString(value.sshAuthMethod);

  const connection: ExportedConnection = {
    uuid: optionalString(value.uuid),
    name: optionalString(value.name) || url,
    url,
    username: optionalString(value.username),
    use_ssh: useSsh,
    ssh_host: optionalString(value.ssh_host) ?? optionalString(value.sshHost),
    ssh_port: optionalNumber(value.ssh_port) ?? optionalNumber(value.sshPort),
    ssh_username: optionalString(value.ssh_username) ?? optionalString(value.sshUsername),
    ssh_auth_method: sshAuthMethod === 'key' ? 'key' : sshAuthMethod === 'password' ? 'password' : undefined,
    ssh_key_path: optionalString(value.ssh_key_path) ?? optionalString(value.sshKeyPath),
  };

  if ('password' in value) {
    connection.password = optionalString(value.password) || '';
  }
  if ('ssh_password' in value || 'sshPassword' in value) {
    connection.ssh_password = optionalString(value.ssh_password ?? value.sshPassword) || '';
  }

  return connection;
};

export const createConnectionExportPayload = (
  connections: Connection[],
  exportedAt = new Date(),
): ConnectionExportFile => ({
  type: CONNECTION_EXPORT_TYPE,
  version: CONNECTION_EXPORT_VERSION,
  exportedAt: exportedAt.toISOString(),
  connections: connections.map(stripSecrets),
});

export const parseConnectionExportPayload = (value: unknown): ExportedConnection[] => {
  if (!isRecord(value)) {
    throw new Error('Connection config file must be a JSON object');
  }
  if (value.type !== CONNECTION_EXPORT_TYPE) {
    throw new Error('Unsupported connection config file');
  }
  if (value.version !== CONNECTION_EXPORT_VERSION) {
    throw new Error('Unsupported connection config version');
  }
  if (!Array.isArray(value.connections)) {
    throw new Error('Connection config file is missing connections');
  }
  return value.connections.map(normalizeConnection);
};
