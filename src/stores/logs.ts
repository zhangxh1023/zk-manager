import { defineStore } from 'pinia';
import { ref } from 'vue';
import { appDataApi } from '../api/appData';

export interface LogEntry {
  id: number;
  timestamp: number;
  connectionName: string;
  command: string;
  details: string;
  success: boolean;
}

const PAGE_SIZE = 20;

export const useLogsStore = defineStore('logs', () => {
  const logs = ref<LogEntry[]>([]);
  const currentPage = ref(1);
  const totalCount = ref(0);

  const loadLogs = async (page: number = 1) => {
    try {
      const result = await appDataApi.listLogs(page, PAGE_SIZE);
      totalCount.value = result.totalCount;
      logs.value = result.logs.map(log => ({
        ...log,
        details: log.details ?? '',
      }));
      currentPage.value = page;
    } catch {
      logs.value = [];
    }
  };

  const addLog = async (connectionName: string, command: string, details: string, success = true) => {
    try {
      await appDataApi.addLog(connectionName, command, details, success);
      // Refresh if on first page
      if (currentPage.value === 1) {
        await loadLogs(1);
      }
    } catch (e) {
      console.error('Failed to add log:', e);
    }
  };

  const clearLogs = async () => {
    try {
      await appDataApi.clearLogs();
      logs.value = [];
      totalCount.value = 0;
      currentPage.value = 1;
    } catch {
      // Ignore clear errors
    }
  };

  const totalPages = () => Math.ceil(totalCount.value / PAGE_SIZE) || 1;
  const hasNextPage = () => currentPage.value < totalPages();
  const hasPrevPage = () => currentPage.value > 1;

  return {
    logs,
    currentPage,
    totalCount,
    loadLogs,
    addLog,
    clearLogs,
    totalPages,
    hasNextPage,
    hasPrevPage,
  };
});
