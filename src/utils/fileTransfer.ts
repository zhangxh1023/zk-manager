import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { readFile, writeTextFile } from '@tauri-apps/plugin-fs';

export interface PickedFile {
  name: string;
  path: string;
  text: string;
  bytes: number[];
}

export interface JsonFileOptions {
  defaultPath: string;
  title?: string;
}

export const safeFileNamePart = (value: string) => {
  const safe = value
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return safe || 'root';
};

export const timestampFilePart = (date = new Date()) =>
  date.toISOString().replace(/[:.]/g, '-');

const fileNameFromPath = (path: string) =>
  path.split(/[\\/]/).pop() || path;

export const saveJsonFile = async (
  data: unknown,
  options: JsonFileOptions,
): Promise<string | null> => {
  const path = await saveDialog({
    title: options.title,
    defaultPath: options.defaultPath,
    filters: [{
      name: 'JSON',
      extensions: ['json'],
    }],
  });

  if (!path) return null;

  const json = JSON.stringify(data, null, 2);
  await writeTextFile(path, json);
  return path;
};

export const pickFile = async (filters: { name: string; extensions: string[] }[]): Promise<PickedFile | null> => {
  const path = await openDialog({
    multiple: false,
    directory: false,
    filters,
  });

  if (!path || Array.isArray(path)) return null;

  const data = await readFile(path);
  const bytes = [...data].map(byte => Number(byte));
  return {
    name: fileNameFromPath(path),
    path,
    text: new TextDecoder().decode(data),
    bytes,
  };
};
