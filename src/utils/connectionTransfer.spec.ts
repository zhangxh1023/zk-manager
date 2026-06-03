import { describe, expect, it } from 'vitest';
import { createConnectionExportPayload, parseConnectionExportPayload } from './connectionTransfer';
import type { Connection } from '../stores/connections';

describe('connectionTransfer', () => {
  it('exports connection configs without passwords', () => {
    const payload = createConnectionExportPayload([
      {
        uuid: 'conn-1',
        name: 'prod',
        url: 'localhost:2181',
        username: 'zk',
        password: 'secret',
        use_ssh: true,
        ssh_host: 'example.com',
        ssh_port: 22,
        ssh_username: 'root',
        ssh_auth_method: 'password',
        ssh_password: 'ssh-secret',
      },
    ] satisfies Connection[]);

    expect(payload.connections).toHaveLength(1);
    expect(payload.connections[0]).not.toHaveProperty('password');
    expect(payload.connections[0]).not.toHaveProperty('ssh_password');
    expect(payload.connections[0]).toMatchObject({
      uuid: 'conn-1',
      name: 'prod',
      url: 'localhost:2181',
      use_ssh: true,
    });
  });

  it('parses exported connection configs', () => {
    const parsed = parseConnectionExportPayload({
      type: 'zk-manager.connections',
      version: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      connections: [
        {
          uuid: 'conn-1',
          name: 'prod',
          url: 'localhost:2181',
          use_ssh: false,
        },
      ],
    });

    expect(parsed).toEqual([
      {
        uuid: 'conn-1',
        name: 'prod',
        url: 'localhost:2181',
        username: undefined,
        use_ssh: false,
        ssh_host: undefined,
        ssh_port: undefined,
        ssh_username: undefined,
        ssh_auth_method: undefined,
        ssh_key_path: undefined,
      },
    ]);
  });
});
