import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import i18n from '../../i18n';
import { appDataApi } from '../../api/appData';
import { useConnectionsStore, type Connection } from '../../stores/connections';
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

const stubWithSlot = { template: '<div><slot /></div>' };
const passthroughStub = { props: ['asChild'], template: '<slot />' };

const testConnections: Connection[] = [
  { uuid: 'conn-a', name: 'Alpha', url: 'localhost:2181' },
  { uuid: 'conn-b', name: 'Beta', url: 'localhost:2182' },
  { uuid: 'conn-c', name: 'Gamma', url: 'localhost:2183' },
];

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
        ConnectionDialog: { template: '<div />' },
        ContextMenu: stubWithSlot,
        ContextMenuContent: stubWithSlot,
        ContextMenuItem: stubWithSlot,
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
    vi.clearAllMocks();
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
