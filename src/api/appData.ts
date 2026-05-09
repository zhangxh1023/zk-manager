import { invoke } from '@tauri-apps/api/core';
import type { Connection } from '../stores/connections';

export interface DbConnectionRow {
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

export interface ConnectionLegacySecrets {
  password?: string;
  ssh_password?: string;
}

export interface LogEntryDto {
  id: number;
  timestamp: number;
  connectionName: string;
  command: string;
  details: string | null;
  success: boolean;
}

export interface LogsPage {
  logs: LogEntryDto[];
  totalCount: number;
}

export interface SettingRow {
  key: string;
  value: string;
}

export interface AppSettingsPayload {
  language: 'en' | 'zh';
  theme: 'light' | 'dark' | 'system';
  scale: number;
}

const toConnectionInput = (conn: Connection) => ({
  uuid: conn.uuid,
  name: conn.name,
  url: conn.url,
  username: conn.username || null,
  use_ssh: conn.use_ssh ?? false,
  ssh_host: conn.use_ssh ? conn.ssh_host || null : null,
  ssh_port: conn.use_ssh ? conn.ssh_port || null : null,
  ssh_username: conn.use_ssh ? conn.ssh_username || null : null,
  ssh_auth_method: conn.use_ssh ? conn.ssh_auth_method || null : null,
  ssh_key_path: conn.use_ssh && conn.ssh_auth_method === 'key' ? conn.ssh_key_path || null : null,
});

export const appDataApi = {
  listConnections: () => invoke<DbConnectionRow[]>('list_connections'),
  getConnectionLegacySecrets: (uuid: string) =>
    invoke<ConnectionLegacySecrets>('get_connection_legacy_secrets', { uuid }),
  clearLegacyConnectionSecret: (uuid: string, secretKey: 'password' | 'ssh_password') =>
    invoke<void>('clear_legacy_connection_secret', { uuid, secretKey }),
  insertConnection: (connection: Connection) =>
    invoke<void>('insert_connection', { connection: toConnectionInput(connection) }),
  updateConnection: (connection: Connection) =>
    invoke<void>('update_connection', { connection: toConnectionInput(connection) }),
  deleteConnection: (uuid: string) => invoke<void>('delete_connection', { uuid }),
  listLogs: (page: number, pageSize: number) =>
    invoke<LogsPage>('list_logs', { page, pageSize }),
  addLog: (connectionName: string, command: string, details: string, success = true) =>
    invoke<void>('add_log', { connectionName, command, details, success }),
  clearLogs: () => invoke<void>('clear_logs'),
  loadSettings: () => invoke<SettingRow[]>('load_settings'),
  saveSettings: (settings: AppSettingsPayload) => invoke<void>('save_settings', { settings }),
};
