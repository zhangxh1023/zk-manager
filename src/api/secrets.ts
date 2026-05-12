import { invoke } from '@tauri-apps/api/core';

export interface ConnectionSecrets {
  password?: string | null;
  sshPassword?: string | null;
}

export const secretsApi = {
  setConnectionSecrets: (
    connectionUuid: string,
    secrets: ConnectionSecrets,
  ) => invoke<void>('set_connection_secrets', {
    connectionUuid,
    secrets,
  }),

  getConnectionSecrets: (connectionUuid: string) =>
    invoke<ConnectionSecrets>('get_connection_secrets', { connectionUuid }),

  deleteConnectionSecrets: (connectionUuid: string) =>
    invoke<void>('delete_connection_secrets', { connectionUuid }),
};
