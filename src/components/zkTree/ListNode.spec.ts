import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import i18n from '../../i18n';
import { appDataApi } from '../../api/appData';
import { confirmDialog } from '../../composables/useConfirmDialog';
import { exportZnodeSubtree } from '../../composables/useZnodeExport';
import { showToast } from '../../utils/toast';
import ListNode from './ListNode.vue';

vi.mock('../../api/appData', () => ({
  appDataApi: {
    addLog: vi.fn().mockResolvedValue(undefined),
    clearLogs: vi.fn().mockResolvedValue(undefined),
    listLogs: vi.fn().mockResolvedValue({ logs: [], totalCount: 0 }),
  },
}));

vi.mock('../../api/zk', () => ({
  zkApi: {
    getDetails: vi.fn(),
    createNode: vi.fn(),
    createNodeRecursive: vi.fn(),
    deleteNode: vi.fn(),
    deleteNodeRecursive: vi.fn(),
    listChildren: vi.fn(),
  },
}));

vi.mock('../../composables/useConfirmDialog', () => ({
  confirmDialog: vi.fn(),
}));

vi.mock('../../composables/useZnodeExport', () => ({
  exportZnodeSubtree: vi.fn(),
}));

vi.mock('../../utils/toast', () => ({
  showToast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const stubWithSlot = { template: '<div><slot /></div>' };
const passthroughStub = { props: ['asChild'], template: '<slot />' };
const buttonStub = {
  props: ['variant', 'disabled'],
  template: '<button type="button" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
};
const contextMenuItemStub = {
  emits: ['select'],
  props: ['variant', 'disabled'],
  template: '<button type="button" :disabled="disabled" @click="$emit(\'select\', $event)"><slot /></button>',
};

const mountListNode = () => {
  const pinia = createPinia();
  setActivePinia(pinia);

  return mount(ListNode, {
    props: {
      connectionUuid: 'conn-a',
      node: {
        name: 'app',
        path: '/app',
        hasChildren: true,
      },
    },
    global: {
      plugins: [pinia, i18n],
      stubs: {
        Button: buttonStub,
        ContextMenu: stubWithSlot,
        ContextMenuContent: stubWithSlot,
        ContextMenuItem: contextMenuItemStub,
        ContextMenuSeparator: { template: '<div />' },
        ContextMenuTrigger: passthroughStub,
        Dialog: stubWithSlot,
        DialogContent: stubWithSlot,
        DialogFooter: stubWithSlot,
        DialogHeader: stubWithSlot,
        DialogTitle: stubWithSlot,
        Input: { template: '<input>' },
        Label: stubWithSlot,
      },
    },
  });
};

const exportButton = (wrapper: ReturnType<typeof mountListNode>) =>
  wrapper.findAll('button').find(button => button.text() === 'Export Node');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(confirmDialog).mockResolvedValue(true);
  vi.mocked(exportZnodeSubtree).mockResolvedValue({
    status: 'exported',
    filePath: '/tmp/app-export.json',
    nodeCount: 3,
  });
});

describe('ListNode export action', () => {
  it('shows an export item in the context menu', () => {
    const wrapper = mountListNode();

    expect(exportButton(wrapper)?.exists()).toBe(true);
  });

  it('does not export when the confirmation dialog is cancelled', async () => {
    vi.mocked(confirmDialog).mockResolvedValue(false);
    const wrapper = mountListNode();

    await exportButton(wrapper)?.trigger('click');
    await flushPromises();

    expect(confirmDialog).toHaveBeenCalledWith({
      title: 'Export Node',
      message: 'Export node /app with all children, ACLs, and metadata?',
      confirmText: 'Export Node',
    });
    expect(exportZnodeSubtree).not.toHaveBeenCalled();
    expect(appDataApi.addLog).not.toHaveBeenCalled();
  });

  it('does not write a log or toast when the save dialog is cancelled', async () => {
    vi.mocked(exportZnodeSubtree).mockResolvedValue({ status: 'cancelled' });
    const wrapper = mountListNode();

    await exportButton(wrapper)?.trigger('click');
    await flushPromises();

    expect(exportZnodeSubtree).toHaveBeenCalledWith({
      connectionUuid: 'conn-a',
      path: '/app',
    });
    expect(appDataApi.addLog).not.toHaveBeenCalled();
    expect(showToast.success).not.toHaveBeenCalled();
    expect(showToast.error).not.toHaveBeenCalled();
  });

  it('exports the node and writes one operation log on success', async () => {
    const wrapper = mountListNode();

    await exportButton(wrapper)?.trigger('click');
    await flushPromises();

    expect(exportZnodeSubtree).toHaveBeenCalledWith({
      connectionUuid: 'conn-a',
      path: '/app',
    });
    expect(appDataApi.addLog).toHaveBeenCalledTimes(1);
    expect(appDataApi.addLog).toHaveBeenCalledWith(
      'conn-a',
      'EXPORT',
      'Exported node /app to /tmp/app-export.json, count: 3',
      true,
    );
    expect(showToast.success).toHaveBeenCalledWith('Exported 3 nodes');
  });
});
