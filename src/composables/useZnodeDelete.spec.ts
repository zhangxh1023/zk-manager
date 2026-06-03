import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { defineComponent } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { zkApi } from '../api/zk';
import en from '../i18n/locales/en';
import zh from '../i18n/locales/zh';
import { useZkTreeStore } from '../stores/zkTree';
import { useZnodeTabsStore, type ZnodeTab } from '../stores/znodeTabs';
import { showToast } from '../utils/toast';
import { confirmDialog } from './useConfirmDialog';
import { useZnodeDelete } from './useZnodeDelete';

vi.mock('../api/zk', () => ({
  zkApi: {
    deleteNode: vi.fn(),
    deleteNodeRecursive: vi.fn(),
    listChildren: vi.fn(),
  },
}));

vi.mock('../api/appData', () => ({
  appDataApi: {
    addLog: vi.fn().mockResolvedValue(undefined),
    listLogs: vi.fn().mockResolvedValue({ logs: [], totalCount: 0 }),
  },
}));

vi.mock('../utils/toast', () => ({
  showToast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('./useConfirmDialog', () => ({
  confirmDialog: vi.fn(),
}));

const createMockTab = (path: string, connectionUuid = 'conn-a'): ZnodeTab => ({
  connectionUuid,
  path,
  znodeData: [],
  stat: null,
  acl: [],
  isActive: false,
  isTemporary: false,
});

const mountDeleteActions = () => {
  let actions: ReturnType<typeof useZnodeDelete> | null = null;
  const pinia = createPinia();
  setActivePinia(pinia);

  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    fallbackLocale: 'en',
    messages: { en, zh },
  });

  const Harness = defineComponent({
    setup() {
      actions = useZnodeDelete();
      return () => null;
    },
  });

  mount(Harness, {
    global: {
      plugins: [pinia, i18n],
    },
  });

  return actions!;
};

describe('useZnodeDelete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(zkApi.listChildren).mockResolvedValue([]);
  });

  it('does not recursively delete when ordinary delete hits a non-empty node', async () => {
    const actions = mountDeleteActions();
    vi.mocked(zkApi.deleteNode).mockRejectedValue({
      code: 'NOT_EMPTY',
      message: 'Cannot delete node with children',
    });

    const deleted = await actions.deleteNode({
      connectionUuid: 'conn-a',
      path: '/parent',
    });

    expect(deleted).toBe(false);
    expect(zkApi.deleteNode).toHaveBeenCalledWith('conn-a', '/parent');
    expect(zkApi.deleteNodeRecursive).not.toHaveBeenCalled();
    expect(confirmDialog).not.toHaveBeenCalled();
    expect(showToast.error).toHaveBeenCalledWith(
      'Node /parent has children. Use recursive delete to delete the subtree.',
    );
  });

  it('recursively deletes a subtree, closes affected tabs, and leaves deleted browsing paths', async () => {
    const actions = mountDeleteActions();
    const tabsStore = useZnodeTabsStore();
    const treeStore = useZkTreeStore();
    vi.mocked(confirmDialog).mockResolvedValue(true);
    vi.mocked(zkApi.deleteNodeRecursive).mockResolvedValue('SUCCESS');

    tabsStore.addTab(createMockTab('/parent'));
    tabsStore.addTab(createMockTab('/parent/child'));
    tabsStore.addTab(createMockTab('/parent-sibling'));
    tabsStore.addTab(createMockTab('/parent/child', 'conn-b'));
    tabsStore.setDirty('conn-a', '/parent/child', true);
    await treeStore.navigateTo('conn-a', '/parent/child');

    const deleted = await actions.deleteNodeRecursive({
      connectionUuid: 'conn-a',
      path: '/parent',
    });

    expect(deleted).toBe(true);
    expect(confirmDialog).toHaveBeenCalledTimes(2);
    expect(zkApi.deleteNodeRecursive).toHaveBeenCalledWith('conn-a', '/parent');
    expect(tabsStore.znodeTabs.map(tab => `${tab.connectionUuid}:${tab.path}`)).toEqual([
      'conn-a:/parent-sibling',
      'conn-b:/parent/child',
    ]);
    expect(treeStore.getCurrentPath('conn-a')).toBe('/');
    expect(showToast.success).toHaveBeenCalledWith('Node subtree deleted successfully');
  });
});
