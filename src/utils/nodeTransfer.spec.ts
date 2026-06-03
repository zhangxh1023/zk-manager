import { describe, expect, it } from 'vitest';
import {
  createNodeExportPayload,
  joinZkPath,
  parseNodeExportPayload,
  relativeNodePath,
} from './nodeTransfer';

describe('nodeTransfer', () => {
  it('round-trips node snapshots as base64 data', () => {
    const payload = createNodeExportPayload('/app', [
      { path: '/app', data: [0, 1, 255] },
      { path: '/app/config', data: [97, 98, 99] },
    ]);

    expect(payload.rootPath).toBe('/app');
    expect(payload.nodes[0].dataBase64).toBe('AAH/');
    expect(parseNodeExportPayload(payload)).toEqual([
      { path: '/app', data: [0, 1, 255] },
      { path: '/app/config', data: [97, 98, 99] },
    ]);
  });

  it('maps exported paths relative to a new import root', () => {
    const sourceRoot = '/app';
    const targetRoot = '/backup';

    expect(relativeNodePath(sourceRoot, '/app')).toBe('');
    expect(relativeNodePath(sourceRoot, '/app/config/db')).toBe('config/db');
    expect(joinZkPath(targetRoot, '')).toBe('/backup');
    expect(joinZkPath(targetRoot, 'config/db')).toBe('/backup/config/db');
  });
});
