import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { zkApi } from '../api/zk';
import type { ZkAclEntry, ZkStat, ZnodeDetails } from '../types/znodeDetails';
import { getErrorCode } from '../utils/errors';
import {
  normalizeZnodePath,
  parentPathOf,
  ZNODE_EXPORT_SCHEMA,
  ZNODE_EXPORT_VERSION,
  znodeNameFromPath,
  type ZnodeExportFile,
} from './useZnodeExport';

export type ZnodeImportConflictPolicy = 'skip' | 'overwrite';

export interface SelectedZnodeImportFile {
  filePath: string;
  fileName: string;
  exportFile: ZnodeExportFile;
}

export interface ZnodeImportPlanNode {
  sourcePath: string;
  path: string;
  data: number[];
  acl: ZkAclEntry[];
}

export interface ZnodeImportPlan {
  sourceRootPath: string;
  targetRootPath: string;
  nodes: ZnodeImportPlanNode[];
}

export interface ZnodeImportResult {
  totalCount: number;
  createdCount: number;
  overwrittenCount: number;
  skippedCount: number;
}

interface ImportZnodeSubtreeOptions {
  connectionUuid: string;
  plan: ZnodeImportPlan;
  conflictPolicy: ZnodeImportConflictPolicy;
  existingPaths?: Iterable<string>;
}

const STAT_KEYS: Array<keyof ZkStat> = [
  'czxid',
  'mzxid',
  'pzxid',
  'ctime',
  'mtime',
  'version',
  'cversion',
  'aversion',
  'ephemeralOwner',
  'dataLength',
  'numChildren',
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function assertImportFormat(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const isValidZnodePath = (path: string) => {
  if (!path.startsWith('/') || path.includes('\0')) return false;
  if (path === '/') return true;
  if (path.endsWith('/') || path.includes('//')) return false;
  return path
    .slice(1)
    .split('/')
    .every(segment => segment !== '' && segment !== '.' && segment !== '..');
};

const decodeBase64 = (value: string): number[] => {
  const validBase64 = value === ''
    || /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
  assertImportFormat(validBase64, 'Node data contains invalid base64.');

  try {
    return Array.from(atob(value), character => character.charCodeAt(0));
  } catch {
    throw new Error('Node data contains invalid base64.');
  }
};

const pathDepth = (path: string) =>
  path === '/' ? 0 : path.split('/').filter(Boolean).length;

const pathsEqual = (left: string[], right: string[]) =>
  left.length === right.length
  && left.every((value, index) => value === right[index]);

const isValidAclPermission = (permission: string) => {
  const normalized = permission.trim().toUpperCase();
  if (normalized === 'ALL' || normalized === 'NONE') return true;
  const allowedPermissions = new Set(['READ', 'WRITE', 'CREATE', 'DELETE', 'ADMIN']);
  const parts = normalized.split('|').map(part => part.trim());
  return parts.length > 0
    && parts.every(part => part !== '' && allowedPermissions.has(part));
};

export function parseZnodeExportFile(contents: string): ZnodeExportFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }

  assertImportFormat(isRecord(parsed), 'The selected file is not a znode export.');
  assertImportFormat(
    parsed.schema === ZNODE_EXPORT_SCHEMA,
    `Unsupported export schema. Expected "${ZNODE_EXPORT_SCHEMA}".`,
  );
  assertImportFormat(
    parsed.version === ZNODE_EXPORT_VERSION,
    `Unsupported export version. Expected version ${ZNODE_EXPORT_VERSION}.`,
  );
  assertImportFormat(
    typeof parsed.exportedAt === 'string',
    'Export timestamp is missing.',
  );
  assertImportFormat(
    typeof parsed.rootPath === 'string' && isValidZnodePath(parsed.rootPath),
    'Export root path is invalid.',
  );
  assertImportFormat(
    Number.isInteger(parsed.nodeCount) && (parsed.nodeCount as number) > 0,
    'Export node count is invalid.',
  );
  assertImportFormat(Array.isArray(parsed.nodes), 'Export nodes are missing.');
  assertImportFormat(
    parsed.nodes.length === parsed.nodeCount,
    'Export node count does not match the node list.',
  );

  const seenPaths = new Set<string>();

  for (const rawNode of parsed.nodes) {
    assertImportFormat(isRecord(rawNode), 'Export contains an invalid node.');
    assertImportFormat(
      typeof rawNode.path === 'string' && isValidZnodePath(rawNode.path),
      'Export contains an invalid node path.',
    );
    assertImportFormat(!seenPaths.has(rawNode.path), `Duplicate node path: ${rawNode.path}`);
    seenPaths.add(rawNode.path);

    assertImportFormat(
      rawNode.path === parsed.rootPath
      || rawNode.path.startsWith(parsed.rootPath === '/' ? '/' : `${parsed.rootPath}/`),
      `Node ${rawNode.path} is outside the exported subtree.`,
    );
    assertImportFormat(
      rawNode.name === znodeNameFromPath(rawNode.path),
      `Node name does not match its path: ${rawNode.path}`,
    );

    const expectedParentPath = parentPathOf(rawNode.path);
    assertImportFormat(
      rawNode.parentPath === expectedParentPath,
      `Parent path does not match node path: ${rawNode.path}`,
    );
    assertImportFormat(
      Array.isArray(rawNode.childNames)
      && rawNode.childNames.every(childName => typeof childName === 'string'),
      `Node ${rawNode.path} has an invalid child list.`,
    );

    assertImportFormat(isRecord(rawNode.data), `Node ${rawNode.path} has invalid data.`);
    assertImportFormat(
      rawNode.data.encoding === 'base64' && typeof rawNode.data.value === 'string',
      `Node ${rawNode.path} uses an unsupported data encoding.`,
    );
    assertImportFormat(
      Number.isInteger(rawNode.data.length) && (rawNode.data.length as number) >= 0,
      `Node ${rawNode.path} has an invalid data length.`,
    );
    const decodedData = decodeBase64(rawNode.data.value);
    assertImportFormat(
      decodedData.length === rawNode.data.length,
      `Node ${rawNode.path} data length does not match its base64 value.`,
    );

    assertImportFormat(
      Array.isArray(rawNode.acl) && rawNode.acl.length > 0,
      `Node ${rawNode.path} has no ACL entries.`,
    );
    for (const aclEntry of rawNode.acl) {
      assertImportFormat(
        isRecord(aclEntry)
        && typeof aclEntry.scheme === 'string'
        && typeof aclEntry.id === 'string'
        && typeof aclEntry.permission === 'string'
        && aclEntry.scheme.length > 0
        && isValidAclPermission(aclEntry.permission),
        `Node ${rawNode.path} has an invalid ACL entry.`,
      );
    }

    assertImportFormat(isRecord(rawNode.stat), `Node ${rawNode.path} has invalid metadata.`);
    const stat = rawNode.stat;
    assertImportFormat(
      STAT_KEYS.every(key => typeof stat[key] === 'number'
        && Number.isFinite(stat[key])),
      `Node ${rawNode.path} has invalid metadata.`,
    );
  }

  assertImportFormat(
    seenPaths.has(parsed.rootPath),
    'The exported root node is missing.',
  );

  const childNamesByParent = new Map<string, string[]>();
  for (const rawNode of parsed.nodes) {
    if (rawNode.path === parsed.rootPath) continue;
    const parentPath = parentPathOf(rawNode.path);
    assertImportFormat(
      parentPath !== null && seenPaths.has(parentPath),
      `Parent node is missing for ${rawNode.path}.`,
    );
    const childNames = childNamesByParent.get(parentPath) ?? [];
    childNames.push(znodeNameFromPath(rawNode.path));
    childNamesByParent.set(parentPath, childNames);
  }

  for (const rawNode of parsed.nodes) {
    const declaredChildNames = [...rawNode.childNames].sort();
    const actualChildNames = (childNamesByParent.get(rawNode.path) ?? []).sort();
    assertImportFormat(
      pathsEqual(declaredChildNames, actualChildNames),
      `Child list does not match exported nodes for ${rawNode.path}.`,
    );
  }

  const exportFile = parsed as unknown as ZnodeExportFile;
  exportFile.nodes.sort((left, right) =>
    pathDepth(left.path) - pathDepth(right.path) || left.path.localeCompare(right.path));

  return exportFile;
}

export async function selectZnodeImportFile(): Promise<SelectedZnodeImportFile | null> {
  const filePath = await open({
    multiple: false,
    directory: false,
    filters: [
      {
        name: 'JSON',
        extensions: ['json'],
      },
    ],
  });

  if (!filePath) return null;

  const contents = await readTextFile(filePath);
  return {
    filePath,
    fileName: filePath.split(/[\\/]/).pop() || filePath,
    exportFile: parseZnodeExportFile(contents),
  };
}

const remapNodePath = (
  sourcePath: string,
  sourceRootPath: string,
  targetRootPath: string,
) => {
  if (sourcePath === sourceRootPath) return targetRootPath;
  const suffix = sourceRootPath === '/'
    ? sourcePath
    : sourcePath.slice(sourceRootPath.length);
  return targetRootPath === '/' ? suffix : `${targetRootPath}${suffix}`;
};

export function buildZnodeImportPlan(
  exportFile: ZnodeExportFile,
  targetRootPath: string,
): ZnodeImportPlan {
  const normalizedTargetRootPath = normalizeZnodePath(targetRootPath);
  assertImportFormat(
    isValidZnodePath(normalizedTargetRootPath),
    'Import target path is invalid.',
  );

  return {
    sourceRootPath: exportFile.rootPath,
    targetRootPath: normalizedTargetRootPath,
    nodes: exportFile.nodes.map(node => ({
      sourcePath: node.path,
      path: remapNodePath(node.path, exportFile.rootPath, normalizedTargetRootPath),
      data: decodeBase64(node.data.value),
      acl: node.acl.map(entry => ({ ...entry })),
    })),
  };
}

export async function findZnodeImportConflicts(
  connectionUuid: string,
  plan: ZnodeImportPlan,
  concurrency = 8,
): Promise<string[]> {
  const conflicts = new Set<string>();
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < plan.nodes.length) {
      const node = plan.nodes[nextIndex];
      nextIndex += 1;
      try {
        await zkApi.getDetails(connectionUuid, node.path);
        conflicts.add(node.path);
      } catch (error) {
        if (getErrorCode(error) !== 'NO_NODE') throw error;
      }
    }
  };

  const workerCount = Math.min(Math.max(1, concurrency), plan.nodes.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return plan.nodes
    .map(node => node.path)
    .filter(path => conflicts.has(path));
}

const overwriteNodeData = async (
  connectionUuid: string,
  node: ZnodeImportPlanNode,
  details?: ZnodeDetails,
) => {
  const currentDetails = details ?? await zkApi.getDetails(connectionUuid, node.path);
  const updatedDetails = await zkApi.setData(
    connectionUuid,
    node.path,
    node.data,
    currentDetails.stat.version,
  );
  return updatedDetails.stat.aversion;
};

export async function importZnodeSubtree(
  options: ImportZnodeSubtreeOptions,
): Promise<ZnodeImportResult> {
  const existingPaths = new Set(options.existingPaths ?? []);
  let createdCount = 0;
  let overwrittenCount = 0;
  let skippedCount = 0;
  const pendingAclUpdates: Array<{
    node: ZnodeImportPlanNode;
    version: number;
  }> = [];

  for (const [index, node] of options.plan.nodes.entries()) {
    if (existingPaths.has(node.path)) {
      if (options.conflictPolicy === 'skip') {
        skippedCount += 1;
      } else {
        const aclVersion = await overwriteNodeData(options.connectionUuid, node);
        pendingAclUpdates.push({ node, version: aclVersion });
        overwrittenCount += 1;
      }
      continue;
    }

    try {
      if (index === 0) {
        await zkApi.createNodeRecursive(options.connectionUuid, node.path, node.data);
      } else {
        await zkApi.createNode(options.connectionUuid, node.path, node.data);
      }
      pendingAclUpdates.push({ node, version: 0 });
      createdCount += 1;
    } catch (error) {
      if (getErrorCode(error) !== 'NODE_EXISTS') throw error;

      if (options.conflictPolicy === 'skip') {
        skippedCount += 1;
      } else {
        const aclVersion = await overwriteNodeData(options.connectionUuid, node);
        pendingAclUpdates.push({ node, version: aclVersion });
        overwrittenCount += 1;
      }
    }
  }

  // Apply ACLs from leaves to root after the full subtree exists. A restrictive
  // parent ACL applied earlier could otherwise prevent its children being created.
  for (const { node, version } of pendingAclUpdates.reverse()) {
    await zkApi.setAcl(
      options.connectionUuid,
      node.path,
      node.acl,
      version,
    );
  }

  return {
    totalCount: options.plan.nodes.length,
    createdCount,
    overwrittenCount,
    skippedCount,
  };
}
