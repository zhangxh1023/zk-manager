import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getDb } from '../db/db';

export interface LogEntry {
  id: number;
  timestamp: number;
  connectionName: string;
  command: string;
  details: string;
}

const PAGE_SIZE = 20;

export const useLogsStore = defineStore('logs', () => {
  const logs = ref<LogEntry[]>([]);
  const currentPage = ref(1);
  const totalCount = ref(0);

  const loadLogs = async (page: number = 1) => {
    const db = await getDb();
    try {
      // 获取总数
      const countResult = await db.select<{ cnt: number }[]>('SELECT COUNT(*) as cnt FROM logs');
      totalCount.value = countResult[0]?.cnt || 0;

      // 获取分页数据
      const offset = (page - 1) * PAGE_SIZE;
      const result = await db.select<LogEntry[]>(
        'SELECT id, timestamp, connectionName, command, details FROM logs ORDER BY timestamp DESC LIMIT $1 OFFSET $2',
        [PAGE_SIZE, offset],
      );
      logs.value = result;
      currentPage.value = page;
    } catch (e) {
      logs.value = [];
    }
  };

  const addLog = async (connectionName: string, command: string, details: string) => {
    const db = await getDb();
    try {
      await db.execute(
        'INSERT INTO logs (timestamp, connectionName, command, details) VALUES ($1, $2, $3, $4)',
        [Date.now(), connectionName, command, details],
      );
      // 如果当前是第一页，刷新一下
      if (currentPage.value === 1) {
        await loadLogs(1);
      }
    } catch (e) {
      console.error('Failed to add log:', e);
    }
  };

  const clearLogs = async () => {
    const db = await getDb();
    try {
      await db.execute('DELETE FROM logs');
      logs.value = [];
      totalCount.value = 0;
      currentPage.value = 1;
    } catch (e) {
      console.error('Failed to clear logs:', e);
    }
  };

  const totalPages = () => Math.ceil(totalCount.value / PAGE_SIZE) || 1;
  const hasNextPage = () => currentPage.value < totalPages();
  const hasPrevPage = () => currentPage.value > 1;

  return { logs, currentPage, totalCount, loadLogs, addLog, clearLogs, totalPages, hasNextPage, hasPrevPage };
});