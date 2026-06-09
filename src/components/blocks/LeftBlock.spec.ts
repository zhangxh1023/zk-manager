import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import i18n from '../../i18n';
import { appDataApi } from '../../api/appData';
import { zkApi } from '../../api/zk';
import { useConnectionsStore, type Connection } from '../../stores/connections';
import { useZnodeTabsStore } from '../../stores/znodeTabs';
import { confirmDialog } from '../../composables/useConfirmDialog';
import LeftBlock from './LeftBlock.vue';

vi.mock('../../api/appData', () => ({
  appDataApi: {
    addLog: vi.fn().mockResolvedValue(undefined),
    clearLogs: vi.fn().mockResolvedValue(undefined),
    listLogs: vi.fn().mockResolvedValue({ logs: [], totalCount: 0 }),
    reorderConnections: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../api/secrets', () => ({
  secretsApi: {
    getConnectionSecrets: vi.fn().mockResolvedValue({}),
    setConnectionSecrets: vi.fn().mockResolvedValue(undefined),
    deleteConnectionSecrets: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../api/zk', () => ({
  zkApi: {
    connect: vi.fn(),
    disconnect: vi.fn(),
  },
}));

vi.mock('../../composables/useConfirmDialog', () => ({
  confirmDialog: vi.fn().mockResolvedValue(true),
}));

const stubWithSlot = { template: '<div><slot /></div>' };
const passthroughStub = { props: ['asChild'], template: '<slot />' };
const contextMenuItemStub = {
  emits: ['select'],
  props: ['variant'],
  template: '<button type="button" @click="$emit(\'select\', $event)"><slot /></button>',
};

const testConnections: Connection[] = [
  { uuid: 'conn-a', name: 'Alpha', url: 'localhost:2181' },
  { uuid: 'conn-b', name: 'Beta', url: 'localhost:2182' },
  { uuid: 'conn-c', name: 'Gamma', url: 'localhost:2183' },
];

const editDisconnectConfirm = {
  title: 'Disconnect Before Editing',
  message: 'Editing this connection requires disconnecting it first. Disconnect and continue editing?',
  confirmText: 'Disconnect',
  cancelText: 'Cancel',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(confirmDialog).mockResolvedValue(true);
});

const mountLeftBlock = () => {
  const pinia = createPinia();
  setActivePinia(pinia);
  const connectionsStore = useConnectionsStore();
  connectionsStore.connections = testConnections.map(conn => ({ ...conn }));

  const wrapper = mount(LeftBlock, {
    global: {
      plugins: [pinia, i18n],
      stubs: {
        AppMenus: { template: '<div />', methods: { openSettings: vi.fn(), openLogs: vi.fn() } },
        Button: stubWithSlot,
        ConnectionDialog: {
          props: ['open', 'mode', 'connection', 'saving', 'testing', 'errorMessage'],
          template: '<div v-if="open" data-testid="connection-dialog">{{ mode }}:{{ connection?.uuid }}</div>',
        },
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
        Tooltip: stubWithSlot,
        TooltipContent: stubWithSlot,
        TooltipProvider: stubWithSlot,
        TooltipTrigger: passthroughStub,
        ZkList: { template: '<div />' },
      },
    },
  });

  return { connectionsStore, wrapper };
};

const rowOrder = (wrapper: VueWrapper) =>
  wrapper
    .findAll('[data-testid^="connection-row-"]')
    .map(row => row.attributes('data-testid')?.replace('connection-row-', ''));

const editButtons = (wrapper: VueWrapper) =>
  wrapper.findAll('button').filter(button => button.text() === 'Edit');

const setRowRects = (wrapper: VueWrapper) => {
  const rects: Record<string, DOMRect> = {
    'conn-a': {
      bottom: 20,
      height: 20,
      left: 0,
      right: 200,
      top: 0,
      width: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect,
    'conn-b': {
      bottom: 40,
      height: 20,
      left: 0,
      right: 200,
      top: 20,
      width: 200,
      x: 0,
      y: 20,
      toJSON: () => ({}),
    } as DOMRect,
    'conn-c': {
      bottom: 60,
      height: 20,
      left: 0,
      right: 200,
      top: 40,
      width: 200,
      x: 0,
      y: 40,
      toJSON: () => ({}),
    } as DOMRect,
  };

  wrapper.findAll('[data-testid^="connection-row-"]').forEach((row) => {
    const uuid = row.attributes('data-connection-uuid');
    if (!uuid) return;
    row.element.getBoundingClientRect = () => rects[uuid];
  });
};

const dispatchPointerEvent = (type: string, options: MouseEventInit & { pointerId: number }) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: options.clientX,
    clientY: options.clientY,
  });
  Object.defineProperty(event, 'pointerId', { value: options.pointerId });
  window.dispatchEvent(event);
};

describe('LeftBlock connection sorting', () => {
  it('previews connection order while dragging the whole row and saves it on pointer up', async () => {
    const { connectionsStore, wrapper } = mountLeftBlock();
    setRowRects(wrapper);

    const alphaRow = wrapper.get('[data-testid="connection-row-conn-a"]');
    await alphaRow.trigger('pointerdown', {
      button: 0,
      clientX: 20,
      clientY: 10,
      pointerId: 1,
    });
    dispatchPointerEvent('pointermove', {
      clientX: 20,
      clientY: 55,
      pointerId: 1,
    });
    await nextTick();

    expect(rowOrder(wrapper)).toEqual(['conn-b', 'conn-c', 'conn-a']);
    const ghost = wrapper.get('[data-testid="connection-drag-ghost"]');
    expect(ghost.text()).toContain('Alpha');
    expect(ghost.attributes('style')).toContain('left: 0px');
    expect(ghost.attributes('style')).toContain('top: 45px');

    dispatchPointerEvent('pointerup', {
      clientX: 20,
      clientY: 55,
      pointerId: 1,
    });
    await flushPromises();
    await nextTick();

    expect(appDataApi.reorderConnections).toHaveBeenCalledWith(['conn-b', 'conn-c', 'conn-a']);
    expect(connectionsStore.connections.map(conn => conn.uuid)).toEqual(['conn-b', 'conn-c', 'conn-a']);
    expect(wrapper.find('[data-testid="connection-drag-ghost"]').exists()).toBe(false);

    wrapper.unmount();
  });
});

describe('LeftBlock connection editing', () => {
  it('disconnects a connected connection before opening the edit dialog', async () => {
    const { connectionsStore, wrapper } = mountLeftBlock();
    const znodeTabsStore = useZnodeTabsStore();
    connectionsStore.connectedSet.add('conn-a');
    connectionsStore.expandedSet.add('conn-a');
    znodeTabsStore.znodeTabs = [
      {
        connectionUuid: 'conn-a',
        path: '/',
        znodeData: [],
        stat: null,
        acl: [],
        isActive: true,
        isTemporary: false,
      },
      {
        connectionUuid: 'conn-b',
        path: '/',
        znodeData: [],
        stat: null,
        acl: [],
        isActive: false,
        isTemporary: false,
      },
    ];

    await editButtons(wrapper)[0].trigger('click');
    await flushPromises();

    expect(zkApi.disconnect).toHaveBeenCalledWith('conn-a');
    expect(confirmDialog).toHaveBeenCalledTimes(1);
    expect(confirmDialog).toHaveBeenCalledWith(editDisconnectConfirm);
    expect(connectionsStore.isConnected('conn-a')).toBe(false);
    expect(connectionsStore.isExpanded('conn-a')).toBe(false);
    expect(znodeTabsStore.znodeTabs.map(tab => tab.connectionUuid)).toEqual(['conn-b']);
    expect(wrapper.get('[data-testid="connection-dialog"]').text()).toBe('edit:conn-a');

    wrapper.unmount();
  });

  it('does not disconnect or open the edit dialog when edit disconnect is cancelled', async () => {
    vi.mocked(confirmDialog).mockResolvedValue(false);
    const { connectionsStore, wrapper } = mountLeftBlock();
    connectionsStore.connectedSet.add('conn-a');

    await editButtons(wrapper)[0].trigger('click');
    await flushPromises();

    expect(confirmDialog).toHaveBeenCalledTimes(1);
    expect(confirmDialog).toHaveBeenCalledWith(editDisconnectConfirm);
    expect(zkApi.disconnect).not.toHaveBeenCalled();
    expect(connectionsStore.isConnected('conn-a')).toBe(true);
    expect(wrapper.find('[data-testid="connection-dialog"]').exists()).toBe(false);

    wrapper.unmount();
  });

  it('does not open the edit dialog when dirty tab disconnect is cancelled', async () => {
    vi.mocked(confirmDialog)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const { connectionsStore, wrapper } = mountLeftBlock();
    const znodeTabsStore = useZnodeTabsStore();
    connectionsStore.connectedSet.add('conn-a');
    znodeTabsStore.znodeTabs = [
      {
        connectionUuid: 'conn-a',
        path: '/',
        znodeData: [],
        stat: null,
        acl: [],
        isActive: true,
        isTemporary: false,
        isDirty: true,
      },
    ];

    await editButtons(wrapper)[0].trigger('click');
    await flushPromises();

    expect(confirmDialog).toHaveBeenCalledTimes(2);
    expect(confirmDialog).toHaveBeenNthCalledWith(1, editDisconnectConfirm);
    expect(confirmDialog).toHaveBeenNthCalledWith(
      2,
      'This connection has unsaved node changes. Disconnecting will discard them. Continue?',
    );
    expect(zkApi.disconnect).not.toHaveBeenCalled();
    expect(connectionsStore.isConnected('conn-a')).toBe(true);
    expect(wrapper.find('[data-testid="connection-dialog"]').exists()).toBe(false);

    wrapper.unmount();
  });
});
