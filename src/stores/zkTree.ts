import { defineStore } from 'pinia';
import { ref } from 'vue';
import { zkApi } from '../api/zk';
import { useLogsStore } from './logs';
import { useConnectionsStore } from './connections';

export interface ZkListNode {
  name: string;
  path: string;
  hasChildren: boolean;
}

export const useZkTreeStore = defineStore('zkTree', () => {
  // Per connection: current path being viewed
  const currentPaths = ref<Record<string, string>>({});

  // Cache: `${connectionUuid}:${path}` -> ZkListNode[]
  const childrenCache = ref<Record<string, ZkListNode[]>>({});

  // Loading states: `${connectionUuid}:${path}` -> boolean
  const loadingStates = ref<Record<string, boolean>>({});

  const cacheKey = (connectionUuid: string, path: string) => `${connectionUuid}:${path}`;

  // Get current path for a connection
  const getCurrentPath = (connectionUuid: string): string => {
    return currentPaths.value[connectionUuid] || '/';
  };

  // Normalize path: remove trailing slash (except for root '/')
  const normalizePath = (path: string): string => {
    if (path === '/') return path;
    return path.endsWith('/') ? path.slice(0, -1) : path;
  };

  // Navigate to a path for a connection
  const navigateTo = async (connectionUuid: string, path: string) => {
    const normalized = normalizePath(path);
    currentPaths.value[connectionUuid] = normalized;
    await fetchChildren(connectionUuid, normalized, true);
  };

  // Navigate up one level
  const navigateUp = async (connectionUuid: string) => {
    const current = getCurrentPath(connectionUuid);
    if (current === '/') return;
    const parent = current.substring(0, current.lastIndexOf('/')) || '/';
    await navigateTo(connectionUuid, parent);
  };

  // Fetch children for a path (with caching)
  const fetchChildren = async (connectionUuid: string, path: string, forceRefresh = false) => {
    const key = cacheKey(connectionUuid, path);
    if (!forceRefresh && childrenCache.value[key] !== undefined) {
      return childrenCache.value[key];
    }
    if (loadingStates.value[key]) {
      return [];
    }

    const logsStore = useLogsStore();
    const connectionsStore = useConnectionsStore();
    const conn = connectionsStore.connections.find(c => c.uuid === connectionUuid);
    const connName = conn?.name || connectionUuid;

    loadingStates.value[key] = true;
    try {
      const childNames = await zkApi.listChildren(connectionUuid, path);
      childrenCache.value[key] = childNames.map(name => {
        const childPath = path === '/' ? `/${name}` : `${path}/${name}`;
        return {
          name,
          path: childPath,
          hasChildren: true,
        };
      });
      await logsStore.addLog(connName, 'LIST_CHILDREN', `Listed children of ${path}, count: ${childNames.length}`, true);
      return childrenCache.value[key];
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await logsStore.addLog(connName, 'LIST_CHILDREN', `Failed to list children of ${path}: ${errorMsg}`, false);
      throw err; // Re-throw to propagate error
    } finally {
      loadingStates.value[key] = false;
    }
  };

  // Get children (from cache)
  const getChildren = (connectionUuid: string, path: string): ZkListNode[] => {
    const key = cacheKey(connectionUuid, path);
    return childrenCache.value[key] || [];
  };

  // Check if loading
  const isLoading = (connectionUuid: string, path: string): boolean => {
    const key = cacheKey(connectionUuid, path);
    return loadingStates.value[key] || false;
  };

  // Locate: navigate to the given path (show its children in the list)
  const locateNode = async (connectionUuid: string, path: string) => {
    await navigateTo(connectionUuid, path);
  };

  // Go to node: navigate to an arbitrary path
  const goToNode = async (connectionUuid: string, path: string) => {
    await navigateTo(connectionUuid, path);
  };

  // Refresh current path
  const refreshCurrentPath = async (connectionUuid: string) => {
    const path = getCurrentPath(connectionUuid);
    await fetchChildren(connectionUuid, path, true);
  };

  // After delete: invalidate parent cache and refresh if needed
  const onNodeDeleted = async (connectionUuid: string, path: string) => {
    const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
    const key = cacheKey(connectionUuid, parentPath);
    delete childrenCache.value[key];
    if (getCurrentPath(connectionUuid) === parentPath) {
      await fetchChildren(connectionUuid, parentPath, true);
    }
  };

  // After create: invalidate parent cache and refresh if needed
  const onNodeCreated = async (connectionUuid: string, parentPath: string) => {
    const key = cacheKey(connectionUuid, parentPath);
    delete childrenCache.value[key];
    if (getCurrentPath(connectionUuid) === parentPath) {
      await fetchChildren(connectionUuid, parentPath, true);
    }
  };

  // Clear all data for a connection
  const clearConnection = (connectionUuid: string) => {
    delete currentPaths.value[connectionUuid];
    const prefix = `${connectionUuid}:`;
    Object.keys(childrenCache.value).forEach(key => {
      if (key.startsWith(prefix)) {
        delete childrenCache.value[key];
      }
    });
  };

  return {
    getCurrentPath,
    navigateTo,
    navigateUp,
    fetchChildren,
    getChildren,
    isLoading,
    locateNode,
    goToNode,
    refreshCurrentPath,
    onNodeDeleted,
    onNodeCreated,
    clearConnection,
  };
});
