import { beforeEach, describe, expect, it, vi } from 'vitest';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { zkApi } from '../api/zk';
import type { ZkStat } from '../types/znodeDetails';
import {
  buildZnodeExportFile,
  defaultExportFileName,
  exportZnodeSubtree,
} from './useZnodeExport';

vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  writeTextFile: vi.fn(),
}));

vi.mock('../api/zk', () => ({
  zkApi: {
    getDetails: vi.fn(),
    listChildren: vi.fn(),
  },
}));

const statFixture = (overrides: Partial<ZkStat> = {}): ZkStat => ({
  czxid: 1,
  mzxid: 2,
  pzxid: 3,
  ctime: 4,
  mtime: 5,
  version: 6,
  cversion: 7,
  aversion: 8,
  ephemeralOwner: 0,
  dataLength: 2,
  numChildren: 0,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildZnodeExportFile', () => {
  it('exports a subtree as a flat list with base64 data, ACL, and stat', async () => {
    const detailsByPath = {
      '/app': {
        data: [104, 105],
        acl: [{ scheme: 'world', id: 'anyone', permission: 'READ' }],
        stat: statFixture({ numChildren: 2 }),
      },
      '/app/config': {
        data: [123, 125],
        acl: [{ scheme: 'digest', id: 'user:hash', permission: 'READ|WRITE' }],
        stat: statFixture({ czxid: 10, dataLength: 2, numChildren: 1 }),
      },
      '/app/config/leaf': {
        data: [],
        acl: [],
        stat: statFixture({ czxid: 11, dataLength: 0 }),
      },
      '/app/db': {
        data: [0, 255],
        acl: [{ scheme: 'auth', id: '', permission: 'ALL' }],
        stat: statFixture({ czxid: 12, dataLength: 2 }),
      },
    };
    const childrenByPath = {
      '/app': ['db', 'config'],
      '/app/config': ['leaf'],
      '/app/config/leaf': [],
      '/app/db': [],
    };

    vi.mocked(zkApi.getDetails).mockImplementation(async (_connectionUuid, path) => {
      return detailsByPath[path as keyof typeof detailsByPath];
    });
    vi.mocked(zkApi.listChildren).mockImplementation(async (_connectionUuid, path) => {
      return childrenByPath[path as keyof typeof childrenByPath];
    });

    const exportFile = await buildZnodeExportFile(
      'conn-a',
      '/app',
      '2026-06-16T01:02:03.000Z',
    );

    expect(exportFile).toMatchObject({
      schema: 'zk-manager.znode-export',
      version: 1,
      exportedAt: '2026-06-16T01:02:03.000Z',
      rootPath: '/app',
      nodeCount: 4,
    });
    expect(exportFile.nodes.map(node => node.path)).toEqual([
      '/app',
      '/app/config',
      '/app/config/leaf',
      '/app/db',
    ]);
    expect(exportFile.nodes[0]).toMatchObject({
      path: '/app',
      name: 'app',
      parentPath: '/',
      childNames: ['config', 'db'],
      data: {
        encoding: 'base64',
        value: 'aGk=',
        length: 2,
      },
      acl: detailsByPath['/app'].acl,
      stat: detailsByPath['/app'].stat,
    });
    expect(exportFile.nodes[3].data).toEqual({
      encoding: 'base64',
      value: 'AP8=',
      length: 2,
    });
  });
});

describe('defaultExportFileName', () => {
  it('uses the node name, timestamp, and sanitized filename characters', () => {
    const fileName = defaultExportFileName(
      '/app/con:fig*?',
      new Date(2026, 5, 16, 2, 3, 4),
    );

    expect(fileName).toBe('con_fig-znode-backup-20260616-020304.json');
  });

  it('uses root as the filename seed for the root znode', () => {
    const fileName = defaultExportFileName('/', new Date(2026, 5, 16, 2, 3, 4));

    expect(fileName).toBe('root-znode-backup-20260616-020304.json');
  });
});

describe('exportZnodeSubtree', () => {
  it('does not read or write anything when the save dialog is cancelled', async () => {
    vi.mocked(save).mockResolvedValue(null);

    const result = await exportZnodeSubtree({
      connectionUuid: 'conn-a',
      path: '/app',
      now: new Date(2026, 5, 16, 2, 3, 4),
    });

    expect(result).toEqual({ status: 'cancelled' });
    expect(zkApi.getDetails).not.toHaveBeenCalled();
    expect(zkApi.listChildren).not.toHaveBeenCalled();
    expect(writeTextFile).not.toHaveBeenCalled();
  });

  it('does not write a file if traversal fails', async () => {
    vi.mocked(save).mockResolvedValue('/tmp/app-export.json');
    vi.mocked(zkApi.getDetails).mockResolvedValue({
      data: [],
      acl: [],
      stat: statFixture(),
    });
    vi.mocked(zkApi.listChildren).mockRejectedValue(new Error('list failed'));

    await expect(exportZnodeSubtree({
      connectionUuid: 'conn-a',
      path: '/app',
      now: new Date(2026, 5, 16, 2, 3, 4),
    })).rejects.toThrow('list failed');

    expect(writeTextFile).not.toHaveBeenCalled();
  });
});
