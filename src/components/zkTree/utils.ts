interface ZkNodeLike {
  name: string;
}

export const normalizeCreateNodePath = (rawPath: string) => {
  const segments = rawPath.trim().split('/').filter(Boolean);
  if (segments.length === 0) return '';
  return `/${segments.join('/')}`;
};

export const getParentPath = (path: string) => {
  if (path === '/') return '/';
  return path.substring(0, path.lastIndexOf('/')) || '/';
};

export const normalizeZnodeFilterQuery = (rawQuery: string) => rawQuery.trim().toLowerCase();

export const filterZkListNodes = <T extends ZkNodeLike>(nodes: T[], rawQuery: string) => {
  const query = normalizeZnodeFilterQuery(rawQuery);
  if (!query) return nodes;

  return nodes.filter(node => node.name.trim().toLowerCase().includes(query));
};
