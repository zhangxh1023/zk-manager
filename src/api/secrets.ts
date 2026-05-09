import { invoke } from '@tauri-apps/api/core';

export type ConnectionSecretKey = 'password' | 'ssh_password';

export const secretsApi = {
  setConnectionSecret: (
    connectionUuid: string,
    secretKey: ConnectionSecretKey,
    secret?: string | null,
  ) => invoke<void>('set_connection_secret', {
    connectionUuid,
    secretKey,
    secret: secret || null,
  }),

  getConnectionSecret: (
    connectionUuid: string,
    secretKey: ConnectionSecretKey,
  ) => invoke<string | null>('get_connection_secret', {
    connectionUuid,
    secretKey,
  }),

  deleteConnectionSecrets: (connectionUuid: string) =>
    invoke<void>('delete_connection_secrets', { connectionUuid }),
};
