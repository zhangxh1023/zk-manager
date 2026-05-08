import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import type { ZnodeDetails, ZkAclEntry } from '../types/znodeDetails';

export enum Command {
  connect_zk = 'connect_zk',
  disconnect_zk = 'disconnect_zk',
  list_children = 'list_children',
  get_data = 'get_data',
  get_acl = 'get_acl',
  get_znode_details = 'get_znode_details',
  set_data = 'set_data',
  delete_node = 'delete_node',
  create_node = 'create_node',
  set_acl = 'set_acl',
  watch_node = 'watch_node',
  unwatch_node = 'unwatch_node',
}

export interface CommandArgs {
  [Command.connect_zk]: {
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
  };
  [Command.disconnect_zk]: { connectionUuid: string };
  [Command.list_children]: { connectionUuid: string; path: string };
  [Command.get_data]: { connectionUuid: string; path: string };
  [Command.get_acl]: { connectionUuid: string; path: string };
  [Command.get_znode_details]: { connectionUuid: string; path: string };
  [Command.set_data]: { connectionUuid: string; path: string; data: number[] };
  [Command.delete_node]: { connectionUuid: string; path: string };
  [Command.create_node]: { connectionUuid: string; path: string; data: number[] };
  [Command.set_acl]: { connectionUuid: string; path: string; aclEntries: ZkAclEntry[] };
  [Command.watch_node]: { connectionUuid: string; path: string };
  [Command.unwatch_node]: { connectionUuid: string; path: string };
}

export interface CommandReturns {
  [Command.connect_zk]: string;
  [Command.disconnect_zk]: string;
  [Command.list_children]: string[];
  [Command.get_data]: number[];
  [Command.get_acl]: ZkAclEntry[];
  [Command.get_znode_details]: ZnodeDetails;
  [Command.set_data]: ZnodeDetails;
  [Command.delete_node]: string;
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
    connectionUuid,
    server,
    username,
    password,
    useSsh,
    sshHost,
    sshPort,
    sshUsername,
    sshAuthMethod,
    sshPassword,
    sshKeyPath,
  }),
  disconnect: (connectionUuid: string) => invoke(Command.disconnect_zk, { connectionUuid }),
  listChildren: (connectionUuid: string, path: string) => invoke(Command.list_children, { connectionUuid, path }),
  getData: (connectionUuid: string, path: string) => invoke(Command.get_data, { connectionUuid, path }),
  getDetails: (connectionUuid: string, path: string) => invoke(Command.get_znode_details, { connectionUuid, path }),
  setData: (connectionUuid: string, path: string, data: number[]) => invoke(Command.set_data, { connectionUuid, path, data }),
  createNode: (connectionUuid: string, path: string, data: number[] = []) => invoke(Command.create_node, { connectionUuid, path, data }),
  deleteNode: (connectionUuid: string, path: string) => invoke(Command.delete_node, { connectionUuid, path }),
  getAcl: (connectionUuid: string, path: string) => invoke(Command.get_acl, { connectionUuid, path }),
  setAcl: (connectionUuid: string, path: string, aclEntries: ZkAclEntry[]) => invoke(Command.set_acl, { connectionUuid, path, aclEntries }),
  watchNode: (connectionUuid: string, path: string) => invoke(Command.watch_node, { connectionUuid, path }),
  unwatchNode: (connectionUuid: string, path: string) => invoke(Command.unwatch_node, { connectionUuid, path }),
};