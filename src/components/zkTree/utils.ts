export const normalizeCreateNodePath = (rawPath: string) => {
  const segments = rawPath.trim().split('/').filter(Boolean);
  if (segments.length === 0) return '';
  return `/${segments.join('/')}`;
};

export const getParentPath = (path: string) => {
  if (path === '/') return '/';
  return path.substring(0, path.lastIndexOf('/')) || '/';
};
