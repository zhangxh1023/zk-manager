import Database from '@tauri-apps/plugin-sql';

let dbPromise: Promise<Database> | null = null;

export const getDb = () => {
  if (!dbPromise) {
    dbPromise = Database.load('sqlite:zk-manager-dev.db');
  }
  return dbPromise;
};