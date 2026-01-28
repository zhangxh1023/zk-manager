import { invoke as tauriInvoke } from '@tauri-apps/api/core';

export enum Command {
  connect_zk = 'connect_zk',
  list_children = 'list_children',
  get_data = 'get_data',
}

export interface CommandArgs {
  [Command.connect_zk]: { server: string };
  [Command.list_children]: { path: string };
  [Command.get_data]: { path: string };
}

export interface CommandReturns {
  [Command.connect_zk]: string;
  [Command.list_children]: string[];
  [Command.get_data]: number[];
}

export async function invoke<K extends Command>(
  command: K,
  args: CommandArgs[K],
): Promise<CommandReturns[K]> {
  return await tauriInvoke(command, args);
}

