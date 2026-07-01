import { beforeEach, describe, expect, it, vi } from 'vitest';
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { zkApi } from '../api/zk';
import type { ZkStat } from '../types/znodeDetails';
import type { ZnodeExportFile } from './useZnodeExport';
import {
  buildZnodeImportPlan,
  findZnodeImportConflicts,
  importZnodeSubtree,
  parseZnodeExportFile,
  selectZnodeImportFile,
} from './useZnodeImport';

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(),
}));

vi.mock('../api/zk', () => ({
  zkApi: {
    getDetails: vi.fn(),
    createNode: vi.fn(),
    createNodeRecursive: vi.fn(),
    setData: vi.fn(),
    setAcl: vi.fn(),
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

const exportFixture = (): ZnodeExportFile => ({
  schema: 'zk-manager.znode-export',
  version: 1,
  exportedAt: '2026-06-16T01:02:03.000Z',
  rootPath: '/app',
  nodeCount: 2,
  nodes: [
    {
      path: '/app',
      name: 'app',
      parentPath: '/',
      childNames: ['config'],
      data: {
        encoding: 'base64',
        value: 'aGk=',
        length: 2,
      },
      acl: [{ scheme: 'world', id: 'anyone', permission: 'ALL' }],
      stat: statFixture({ numChildren: 1 }),
    },
    {
      path: '/app/config',
      name: 'config',
      parentPath: '/app',
      childNames: [],
      data: {
        encoding: 'base64',
        value: 'AP8=',
        length: 2,
      },
      acl: [{ scheme: 'digest', id: 'user:hash', permission: 'READ|WRITE' }],
      stat: statFixture(),
    },
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('parseZnodeExportFile', () => {
  it('validates the export format and preserves binary data', () => {
    const parsed = parseZnodeExportFile(JSON.stringify(exportFixture()));
    const plan = buildZnodeImportPlan(parsed, '/restored/app');

    expect(plan).toEqual({
      sourceRootPath: '/app',
      targetRootPath: '/restored/app',
      nodes: [
        {
          sourcePath: '/app',
          path: '/restored/app',
          data: [104, 105],
          acl: [{ scheme: 'world', id: 'anyone', permission: 'ALL' }],
        },
        {
          sourcePath: '/app/config',
          path: '/restored/app/config',
          data: [0, 255],
          acl: [{ scheme: 'digest', id: 'user:hash', permission: 'READ|WRITE' }],
        },
      ],
    });
  });

  it('rejects corrupt base64 before importing any nodes', () => {
    const fixture = exportFixture();
    fixture.nodes[1].data.value = 'not base64';

    expect(() => parseZnodeExportFile(JSON.stringify(fixture)))
      .toThrow('invalid base64');
  });

  it('rejects a child list that does not match the exported nodes', () => {
    const fixture = exportFixture();
    fixture.nodes[0].childNames = [];

    expect(() => parseZnodeExportFile(JSON.stringify(fixture)))
      .toThrow('Child list does not match');
  });

  it('can remap a root export below a new persistent node', () => {
    const fixture = exportFixture();
    fixture.rootPath = '/';
    fixture.nodes[0].path = '/';
    fixture.nodes[0].name = 'root';
    fixture.nodes[0].parentPath = null;
    fixture.nodes[1].path = '/config';
    fixture.nodes[1].parentPath = '/';

    const parsed = parseZnodeExportFile(JSON.stringify(fixture));
    const plan = buildZnodeImportPlan(parsed, '/restored');

    expect(plan.nodes.map(node => node.path)).toEqual([
      '/restored',
      '/restored/config',
    ]);
  });
});

describe('selectZnodeImportFile', () => {
  it('returns null when file selection is cancelled', async () => {
    vi.mocked(open).mockResolvedValue(null);

    await expect(selectZnodeImportFile()).resolves.toBeNull();
    expect(readTextFile).not.toHaveBeenCalled();
  });

  it('reads and validates the selected file', async () => {
    vi.mocked(open).mockResolvedValue('/tmp/app-backup.json');
    vi.mocked(readTextFile).mockResolvedValue(JSON.stringify(exportFixture()));

    const selected = await selectZnodeImportFile();

    expect(selected?.fileName).toBe('app-backup.json');
    expect(selected?.exportFile.nodeCount).toBe(2);
  });
});

describe('findZnodeImportConflicts', () => {
  it('returns existing paths and ignores NO_NODE responses', async () => {
    const plan = buildZnodeImportPlan(exportFixture(), '/app');
    vi.mocked(zkApi.getDetails).mockImplementation(async (_connectionUuid, path) => {
      if (path === '/app') {
        return {
          data: [],
          acl: [],
          stat: statFixture(),
        };
      }
      throw { code: 'NO_NODE', message: 'Node does not exist' };
    });

    await expect(findZnodeImportConflicts('conn-a', plan)).resolves.toEqual(['/app']);
  });

  it('does not hide connection or permission errors', async () => {
    const plan = buildZnodeImportPlan(exportFixture(), '/app');
    vi.mocked(zkApi.getDetails).mockRejectedValue({
      code: 'CONNECTION_LOST',
      message: 'Connection lost',
    });

    await expect(findZnodeImportConflicts('conn-a', plan))
      .rejects.toMatchObject({ code: 'CONNECTION_LOST' });
  });
});

describe('importZnodeSubtree', () => {
  it('skips existing nodes and creates missing descendants with ACLs', async () => {
    const plan = buildZnodeImportPlan(exportFixture(), '/app');
    vi.mocked(zkApi.createNode).mockResolvedValue('SUCCESS');
    vi.mocked(zkApi.setAcl).mockResolvedValue('SUCCESS');

    const result = await importZnodeSubtree({
      connectionUuid: 'conn-a',
      plan,
      conflictPolicy: 'skip',
      existingPaths: ['/app'],
    });

    expect(result).toEqual({
      totalCount: 2,
      createdCount: 1,
      overwrittenCount: 0,
      skippedCount: 1,
    });
    expect(zkApi.createNodeRecursive).not.toHaveBeenCalled();
    expect(zkApi.createNode).toHaveBeenCalledWith(
      'conn-a',
      '/app/config',
      [0, 255],
    );
    expect(zkApi.setAcl).toHaveBeenCalledWith(
      'conn-a',
      '/app/config',
      [{ scheme: 'digest', id: 'user:hash', permission: 'READ|WRITE' }],
      0,
    );
  });

  it('overwrites existing data and ACLs while creating missing nodes', async () => {
    const plan = buildZnodeImportPlan(exportFixture(), '/app');
    const currentDetails = {
      data: [1],
      acl: [{ scheme: 'world', id: 'anyone', permission: 'READ' }],
      stat: statFixture({ version: 4, aversion: 2 }),
    };
    const updatedDetails = {
      ...currentDetails,
      data: [104, 105],
      stat: statFixture({ version: 5, aversion: 2 }),
    };
    vi.mocked(zkApi.getDetails).mockResolvedValue(currentDetails);
    vi.mocked(zkApi.setData).mockResolvedValue(updatedDetails);
    vi.mocked(zkApi.createNode).mockResolvedValue('SUCCESS');
    vi.mocked(zkApi.setAcl).mockResolvedValue('SUCCESS');

    const result = await importZnodeSubtree({
      connectionUuid: 'conn-a',
      plan,
      conflictPolicy: 'overwrite',
      existingPaths: ['/app'],
    });

    expect(result).toEqual({
      totalCount: 2,
      createdCount: 1,
      overwrittenCount: 1,
      skippedCount: 0,
    });
    expect(zkApi.setData).toHaveBeenCalledWith('conn-a', '/app', [104, 105], 4);
    expect(zkApi.setAcl).toHaveBeenCalledWith(
      'conn-a',
      '/app',
      [{ scheme: 'world', id: 'anyone', permission: 'ALL' }],
      2,
    );
    expect(vi.mocked(zkApi.setAcl).mock.calls.map(call => call[1]))
      .toEqual(['/app/config', '/app']);
  });

  it('handles a node created after conflict inspection according to the policy', async () => {
    const plan = buildZnodeImportPlan(exportFixture(), '/copy');
    vi.mocked(zkApi.createNodeRecursive).mockRejectedValue({
      code: 'NODE_EXISTS',
      message: 'Node already exists',
    });
    vi.mocked(zkApi.createNode).mockResolvedValue('SUCCESS');
    vi.mocked(zkApi.setAcl).mockResolvedValue('SUCCESS');

    const result = await importZnodeSubtree({
      connectionUuid: 'conn-a',
      plan,
      conflictPolicy: 'skip',
    });

    expect(result.skippedCount).toBe(1);
    expect(result.createdCount).toBe(1);
  });
});
