import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { zkApi } from '../api/zk';
import type { ZkAclEntry, ZkStat } from '../types/znodeDetails';

export const ZNODE_EXPORT_SCHEMA = 'zk-manager.znode-export' as const;
export const ZNODE_EXPORT_VERSION = 1;

const BASE64_CHUNK_SIZE = 0x8000;

export interface ZnodeExportData {
  encoding: 'base64';
  value: string;
  length: number;
}

export interface ZnodeExportNode {
  path: string;
  name: string;
  parentPath: string | null;
  childNames: string[];
  data: ZnodeExportData;
  acl: ZkAclEntry[];
  stat: ZkStat;
}

export interface ZnodeExportFile {
  schema: typeof ZNODE_EXPORT_SCHEMA;
  version: typeof ZNODE_EXPORT_VERSION;
  exportedAt: string;
  rootPath: string;
  nodeCount: number;
  nodes: ZnodeExportNode[];
}

export interface ExportZnodeSubtreeOptions {
  connectionUuid: string;
  path: string;
  now?: Date;
}

export type ExportZnodeSubtreeResult =
  | {
    status: 'exported';
    filePath: string;
    nodeCount: number;
  }
  | {
    status: 'cancelled';
  };

export function normalizeZnodePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed || trimmed === '/') return '/';
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`;
}

export function znodeNameFromPath(path: string): string {
  const normalized = normalizeZnodePath(path);
  if (normalized === '/') return 'root';
  const segments = normalized.split('/').filter(Boolean);
  return segments[segments.length - 1] || 'root';
}

export function parentPathOf(path: string): string | null {
  const normalized = normalizeZnodePath(path);
  if (normalized === '/') return null;
  const lastSlashIndex = normalized.lastIndexOf('/');
  return lastSlashIndex <= 0 ? '/' : normalized.slice(0, lastSlashIndex);
}

export function childPathOf(parentPath: string, childName: string): string {
  const normalizedParentPath = normalizeZnodePath(parentPath);
  return normalizedParentPath === '/' ? `/${childName}` : `${normalizedParentPath}/${childName}`;
}

export function bytesToBase64(bytes: number[]): string {
  const binaryParts: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_SIZE) {
    const chunk = bytes.slice(offset, offset + BASE64_CHUNK_SIZE);
    binaryParts.push(String.fromCharCode(...chunk));
  }
  return btoa(binaryParts.join(''));
}

export function formatExportTimestamp(date: Date): string {
  const pad2 = (value: number) => value.toString().padStart(2, '0');
  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
    '-',
    pad2(date.getHours()),
    pad2(date.getMinutes()),
    pad2(date.getSeconds()),
  ].join('');
}

export function sanitizeExportFileNamePart(name: string): string {
  const sanitized = name
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, '_')
    .trim()
    .replace(/^_+|_+$/g, '');
  return sanitized || 'znode';
}

export function defaultExportFileName(path: string, date = new Date()): string {
  const nodeName = sanitizeExportFileNamePart(znodeNameFromPath(path));
  return `${nodeName}-znode-backup-${formatExportTimestamp(date)}.json`;
}

export async function buildZnodeExportFile(
  connectionUuid: string,
  rootPath: string,
  exportedAt = new Date().toISOString(),
): Promise<ZnodeExportFile> {
  const normalizedRootPath = normalizeZnodePath(rootPath);
  const nodes: ZnodeExportNode[] = [];

  const visit = async (path: string) => {
    const [details, childNames] = await Promise.all([
      zkApi.getDetails(connectionUuid, path),
      zkApi.listChildren(connectionUuid, path),
    ]);
    const sortedChildNames = [...childNames].sort();

    nodes.push({
      path,
      name: znodeNameFromPath(path),
      parentPath: parentPathOf(path),
      childNames: sortedChildNames,
      data: {
        encoding: 'base64',
        value: bytesToBase64(details.data),
        length: details.data.length,
      },
      acl: details.acl,
      stat: details.stat,
    });

    for (const childName of sortedChildNames) {
      await visit(childPathOf(path, childName));
    }
  };

  await visit(normalizedRootPath);

  return {
    schema: ZNODE_EXPORT_SCHEMA,
    version: ZNODE_EXPORT_VERSION,
    exportedAt,
    rootPath: normalizedRootPath,
    nodeCount: nodes.length,
    nodes,
  };
}

export async function exportZnodeSubtree(
  options: ExportZnodeSubtreeOptions,
): Promise<ExportZnodeSubtreeResult> {
  const now = options.now ?? new Date();
  const filePath = await save({
    defaultPath: defaultExportFileName(options.path, now),
    filters: [
      {
        name: 'JSON',
        extensions: ['json'],
      },
    ],
  });

  if (!filePath) {
    return { status: 'cancelled' };
  }

  const exportFile = await buildZnodeExportFile(
    options.connectionUuid,
    options.path,
    now.toISOString(),
  );
  await writeTextFile(filePath, `${JSON.stringify(exportFile, null, 2)}\n`);

  return {
    status: 'exported',
    filePath,
    nodeCount: exportFile.nodeCount,
  };
}
