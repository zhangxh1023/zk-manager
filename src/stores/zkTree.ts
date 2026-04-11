import { defineStore } from 'pinia';
import { ref } from 'vue';
import { zkApi } from '../api/zk';

export interface ZkTreeNode {
  name: string;
  path: string;
  hasChildren: boolean;
  expanded: boolean;
  children: ZkTreeNode[];
  loading: boolean;
}

export const useZkTreeStore = defineStore('zkTree', () => {
  // key: connectionUuid, value: root nodes of that connection's tree
  const trees = ref<Record<string, ZkTreeNode[]>>({});

  const getNodeByPath = (connectionUuid: string, path: string): ZkTreeNode | null => {
    const roots = trees.value[connectionUuid];
    if (!roots) return null;

    const search = (nodes: ZkTreeNode[], targetPath: string): ZkTreeNode | null => {
      for (const node of nodes) {
        if (node.path === targetPath) return node;
        const found = search(node.children, targetPath);
        if (found) return found;
      }
      return null;
    };

    return search(roots, path);
  };

  const getParentNode = (connectionUuid: string, path: string): ZkTreeNode | null => {
    const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
    return getNodeByPath(connectionUuid, parentPath);
  };

  const fetchRoot = async (connectionUuid: string) => {
    const children = await zkApi.listChildren('/');
    trees.value[connectionUuid] = children.map(name => ({
      name,
      path: '/' + name,
      hasChildren: true, // assume has children until proven otherwise
      expanded: false,
      children: [],
      loading: false,
    }));
  };

  const fetchChildren = async (node: ZkTreeNode) => {
    if (node.loading) return;
    node.loading = true;
    try {
      const children = await zkApi.listChildren(node.path);
      node.children = children.map(name => {
        const childPath = node.path === '/' ? `/${name}` : `${node.path}/${name}`;
        return {
          name,
          path: childPath,
          hasChildren: true,
          expanded: false,
          children: [],
          loading: false,
        };
      });
      node.hasChildren = children.length > 0;
    } finally {
      node.loading = false;
    }
  };

  const toggle = async (_connectionUuid: string, node: ZkTreeNode) => {
    if (!node.hasChildren) return;
    if (!node.expanded) {
      await fetchChildren(node);
    }
    node.expanded = !node.expanded;
  };

  const refreshNode = async (connectionUuid: string, path: string) => {
    const node = getNodeByPath(connectionUuid, path);
    if (!node) return;
    node.children = [];
    node.expanded = false;
    await fetchChildren(node);
  };

  const removeNode = (connectionUuid: string, path: string) => {
    const parent = getParentNode(connectionUuid, path);
    if (parent) {
      parent.children = parent.children.filter(n => n.path !== path);
    } else {
      // it's a root node
      trees.value[connectionUuid] = trees.value[connectionUuid].filter(n => n.path !== path);
    }
  };

  const clearTree = (connectionUuid: string) => {
    delete trees.value[connectionUuid];
  };

  return {
    trees,
    getNodeByPath,
    getParentNode,
    fetchRoot,
    fetchChildren,
    toggle,
    refreshNode,
    removeNode,
    clearTree,
  };
});