import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import type { ZnodeDetails, ZkAclEntry } from '../types/znodeDetails';

export enum Command {
  connect_zk = 'connect_zk',
  list_children = 'list_children',
  get_data = 'get_data',
  get_acl = 'get_acl',
  get_znode_details = 'get_znode_details',
  set_data = 'set_data',
  delete_node = 'delete_node',
  create_node = 'create_node',
  set_acl = 'set_acl',
}

export interface CommandArgs {
  [Command.connect_zk]: {
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
  [Command.list_children]: { path: string };
  [Command.get_data]: { path: string };
  [Command.get_acl]: { path: string };
  [Command.get_znode_details]: { path: string };
  [Command.set_data]: { path: string; data: number[] };
  [Command.delete_node]: { path: string };
  [Command.create_node]: { path: string; data: number[] };
  [Command.set_acl]: { path: string; acl_entries: ZkAclEntry[] };
}

export interface CommandReturns {
  [Command.connect_zk]: string;
  [Command.list_children]: string[];
  [Command.get_data]: number[];
  [Command.get_acl]: ZkAclEntry[];
  [Command.get_znode_details]: ZnodeDetails;
  [Command.set_data]: ZnodeDetails;
  [Command.delete_node]: string;
  [Command.create_node]: string;
  [Command.set_acl]: string;
}

async function invoke<K extends Command>(
  command: K,
  args: CommandArgs[K],
): Promise<CommandReturns[K]> {
  return await tauriInvoke(command, args);
}

export const zkApi = {
  connect: (
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
  listChildren: (path: string) => invoke(Command.list_children, { path }),
  getData: (path: string) => invoke(Command.get_data, { path }),
  getDetails: (path: string) => invoke(Command.get_znode_details, { path }),
  setData: (path: string, data: number[]) => invoke(Command.set_data, { path, data }),
  createNode: (path: string, data: number[] = []) => invoke(Command.create_node, { path, data }),
  deleteNode: (path: string) => invoke(Command.delete_node, { path }),
  getAcl: (path: string) => invoke(Command.get_acl, { path }),
  setAcl: (path: string, aclEntries: ZkAclEntry[]) => invoke(Command.set_acl, { path, acl_entries: aclEntries }),
};