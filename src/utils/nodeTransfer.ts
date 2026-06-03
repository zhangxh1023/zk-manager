export const NODE_EXPORT_TYPE = 'zk-manager.node-export';
export const NODE_EXPORT_VERSION = 1;

export interface NodeSnapshot {
  path: string;
  data: number[];
}

export interface ExportedNodeSnapshot {
  path: string;
  dataBase64: string;
}

export interface NodeExportFile {
  type: typeof NODE_EXPORT_TYPE;
  version: typeof NODE_EXPORT_VERSION;
  exportedAt: string;
  rootPath: string;
  nodes: ExportedNodeSnapshot[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const normalizeZkPath = (path: string) => {
  const trimmed = path.trim();
  if (!trimmed || trimmed === '/') return '/';
  return `/${trimmed.split('/').filter(Boolean).join('/')}`;
};

export const bytesToBase64 = (bytes: number[]) => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return btoa(binary);
};

export const base64ToBytes = (value: string) => {
  const binary = atob(value);
  const bytes: number[] = [];
  for (let index = 0; index < binary.length; index += 1) {
    bytes.push(binary.charCodeAt(index));
  }
  return bytes;
};

export const relativeNodePath = (rootPath: string, path: string) => {
  const normalizedRoot = normalizeZkPath(rootPath);
  const normalizedPath = normalizeZkPath(path);
  if (normalizedPath === normalizedRoot) return '';
  const prefix = normalizedRoot === '/' ? '/' : `${normalizedRoot}/`;
  if (!normalizedPath.startsWith(prefix)) {
    throw new Error(`${normalizedPath} is not under ${normalizedRoot}`);
  }
  return normalizedPath.slice(prefix.length);
};

export const joinZkPath = (basePath: string, relativePath: string) => {
  const normalizedBase = normalizeZkPath(basePath);
  const relative = relativePath.split('/').filter(Boolean).join('/');
  if (!relative) return normalizedBase;
  return normalizedBase === '/' ? `/${relative}` : `${normalizedBase}/${relative}`;
};

export const znodeDepth = (path: string) =>
  normalizeZkPath(path).split('/').filter(Boolean).length;

export const createNodeExportPayload = (
  rootPath: string,
  nodes: NodeSnapshot[],
  exportedAt = new Date(),
): NodeExportFile => ({
  type: NODE_EXPORT_TYPE,
  version: NODE_EXPORT_VERSION,
  exportedAt: exportedAt.toISOString(),
  rootPath: normalizeZkPath(rootPath),
  nodes: nodes.map(node => ({
    path: normalizeZkPath(node.path),
    dataBase64: bytesToBase64(node.data),
  })),
});

export const parseNodeExportPayload = (value: unknown): NodeSnapshot[] => {
  if (!isRecord(value)) {
    throw new Error('Node export file must be a JSON object');
  }
  if (value.type !== NODE_EXPORT_TYPE) {
    throw new Error('Unsupported node export file');
  }
  if (value.version !== NODE_EXPORT_VERSION) {
    throw new Error('Unsupported node export version');
  }
  if (typeof value.rootPath !== 'string') {
    throw new Error('Node export file is missing rootPath');
  }
  if (!Array.isArray(value.nodes)) {
    throw new Error('Node export file is missing nodes');
  }

  const rootPath = normalizeZkPath(value.rootPath);
  return value.nodes.map((node, index) => {
    if (!isRecord(node)) {
      throw new Error(`Node #${index + 1} is not an object`);
    }
    if (typeof node.path !== 'string' || typeof node.dataBase64 !== 'string') {
      throw new Error(`Node #${index + 1} is invalid`);
    }
    const path = normalizeZkPath(node.path);
    relativeNodePath(rootPath, path);
    return {
      path,
      data: base64ToBytes(node.dataBase64),
    };
  });
};

export const parseNodeExportMetadata = (value: unknown) => {
  if (!isRecord(value) || value.type !== NODE_EXPORT_TYPE || typeof value.rootPath !== 'string') {
    return null;
  }
  return {
    rootPath: normalizeZkPath(value.rootPath),
    nodeCount: Array.isArray(value.nodes) ? value.nodes.length : 0,
  };
};
