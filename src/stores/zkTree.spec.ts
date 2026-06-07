import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { zkApi } from '../api/zk';
import { useZkTreeStore } from './zkTree';

vi.mock('../api/zk', () => ({
  zkApi: {
    listChildren: vi.fn(),
  },
}));

vi.mock('../api/appData', () => ({
  appDataApi: {
    addLog: vi.fn().mockResolvedValue(undefined),
    clearLogs: vi.fn().mockResolvedValue(undefined),
    listLogs: vi.fn().mockResolvedValue({ logs: [], totalCount: 0 }),
  },
}));

describe('zkTree store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('refreshes the current path and invalidates ancestor caches after a full-path create', async () => {
    const childrenByPath: Record<string, string[]> = {
      '/': ['a'],
      '/a': ['old-b'],
      '/a/b': ['old-c'],
      '/current': ['before'],
    };

    vi.mocked(zkApi.listChildren).mockImplementation(async (_connectionUuid, path) => {
      return childrenByPath[path] || [];
    });

    const store = useZkTreeStore();
    await store.fetchChildren('conn-a', '/');
    await store.fetchChildren('conn-a', '/a');
    await store.fetchChildren('conn-a', '/a/b');
    await store.navigateTo('conn-a', '/current');

    childrenByPath['/'] = ['a', 'new-root-child'];
    childrenByPath['/a'] = ['b'];
    childrenByPath['/a/b'] = ['c'];
    childrenByPath['/current'] = ['after'];

    await store.onNodeCreatedAtPath('conn-a', '/a/b/c', {
      refreshCurrentPath: true,
    });

    expect(store.getCurrentPath('conn-a')).toBe('/current');
    expect(store.getChildren('conn-a', '/current').map(node => node.name)).toEqual(['after']);
    expect(vi.mocked(zkApi.listChildren).mock.calls.filter(([, path]) => path === '/current')).toHaveLength(2);

    const callsBeforeCacheReads = vi.mocked(zkApi.listChildren).mock.calls.length;
    await store.fetchChildren('conn-a', '/a');
    await store.fetchChildren('conn-a', '/a/b');
    await store.fetchChildren('conn-a', '/');

    expect(
      vi.mocked(zkApi.listChildren).mock.calls
        .slice(callsBeforeCacheReads)
        .map(([, path]) => path),
    ).toEqual(['/a', '/a/b', '/']);
  });
});
