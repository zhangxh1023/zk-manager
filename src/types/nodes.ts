export interface ZkNodeInfo {
  parentPath: string;
  name: string;
  nodes: ZkNodeInfo[],
};

export type ZkNodeList = ZkNodeInfo[];