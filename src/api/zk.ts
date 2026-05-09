import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import type { ZnodeDetails, ZkAclEntry } from '../types/znodeDetails';

export enum Command {
  connect_zk = 'connect_zk',
  disconnect_zk = 'disconnect_zk',
  list_children = 'list_children',
  search_nodes = 'search_nodes',
  get_data = 'get_data',
  get_acl = 'get_acl',
  get_znode_details = 'get_znode_details',
  set_data = 'set_data',
  delete_node = 'delete_node',
  delete_node_recursive = 'delete_node_recursive',
  create_node = 'create_node',
  set_acl = 'set_acl',
  watch_node = 'watch_node',
  unwatch_node = 'unwatch_node',
}

export interface ConnectZkRequest {
  connectionUuid: string;
  server: string;
  username?: string;
  password?: string;
  useSsh?: boolean;
  sshHost?: string;
  sshPort?: number;
  sshUsername?: string;
  sshAuthMethod?: string;
  sshPassword?: string;
  sshKeyPath?: string;
}

export interface ZnodeSearchResult {
  name: string;
  path: string;
}

export interface CommandArgs {
  [Command.connect_zk]: { request: ConnectZkRequest };
  [Command.disconnect_zk]: { connectionUuid: string };
  [Command.list_children]: { connectionUuid: string; path: string };
  [Command.search_nodes]: { connectionUuid: string; rootPath: string; query: string; maxResults?: number };
  [Command.get_data]: { connectionUuid: string; path: string };
  [Command.get_acl]: { connectionUuid: string; path: string };
  [Command.get_znode_details]: { connectionUuid: string; path: string };
  [Command.set_data]: { connectionUuid: string; path: string; data: number[]; version: number };
  [Command.delete_node]: { connectionUuid: string; path: string };
  [Command.delete_node_recursive]: { connectionUuid: string; path: string };
  [Command.create_node]: { connectionUuid: string; path: string; data: number[] };
  [Command.set_acl]: { connectionUuid: string; path: string; aclEntries: ZkAclEntry[]; version: number };
  [Command.watch_node]: { connectionUuid: string; path: string };
  [Command.unwatch_node]: { connectionUuid: string; path: string };
}

export interface CommandReturns {
  [Command.connect_zk]: string;
  [Command.disconnect_zk]: string;
  [Command.list_children]: string[];
  [Command.search_nodes]: ZnodeSearchResult[];
  [Command.get_data]: number[];
  [Command.get_acl]: ZkAclEntry[];
  [Command.get_znode_details]: ZnodeDetails;
  [Command.set_data]: ZnodeDetails;
  [Command.delete_node]: string;
  [Command.delete_node_recursive]: string;
  [Command.create_node]: string;
  [Command.set_acl]: string;
  [Command.watch_node]: string;
  [Command.unwatch_node]: string;
}

async function invoke<K extends Command>(
  command: K,
  args: CommandArgs[K],
): Promise<CommandReturns[K]> {
  return await tauriInvoke(command, args);
}

export const zkApi = {
  connect: (
    connectionUuid: string,
    server: string,
    username?: string,
    password?: string,
    useSsh?: boolean,
    sshHost?: string,
    sshPort?: number,
    sshUsername?: string,
    sshAuthMethod?: string,
    sshPassword?: string,
    sshKeyPath?: string,
  ) => invoke(Command.connect_zk, {
    request: {
      connectionUuid,
      server,
      username,
      password,
      useSsh: useSsh ?? false,
      sshHost,
      sshPort,
      sshUsername,
      sshAuthMethod,
      sshPassword,
      sshKeyPath,
    },
  }),
  disconnect: (connectionUuid: string) => invoke(Command.disconnect_zk, { connectionUuid }),
  listChildren: (connectionUuid: string, path: string) => invoke(Command.list_children, { connectionUuid, path }),
  searchNodes: (connectionUuid: string, rootPath: string, query: string, maxResults = 50) =>
    invoke(Command.search_nodes, { connectionUuid, rootPath, query, maxResults }),
  getData: (connectionUuid: string, path: string) => invoke(Command.get_data, { connectionUuid, path }),
  getDetails: (connectionUuid: string, path: string) => invoke(Command.get_znode_details, { connectionUuid, path }),
  setData: (connectionUuid: string, path: string, data: number[], version: number) =>
    invoke(Command.set_data, { connectionUuid, path, data, version }),
  createNode: (connectionUuid: string, path: string, data: number[] = []) => invoke(Command.create_node, { connectionUuid, path, data }),
  deleteNode: (connectionUuid: string, path: string) => invoke(Command.delete_node, { connectionUuid, path }),
  deleteNodeRecursive: (connectionUuid: string, path: string) =>
    invoke(Command.delete_node_recursive, { connectionUuid, path }),
  getAcl: (connectionUuid: string, path: string) => invoke(Command.get_acl, { connectionUuid, path }),
  setAcl: (connectionUuid: string, path: string, aclEntries: ZkAclEntry[], version: number) =>
    invoke(Command.set_acl, { connectionUuid, path, aclEntries, version }),
  watchNode: (connectionUuid: string, path: string) => invoke(Command.watch_node, { connectionUuid, path }),
  unwatchNode: (connectionUuid: string, path: string) => invoke(Command.unwatch_node, { connectionUuid, path }),
};
