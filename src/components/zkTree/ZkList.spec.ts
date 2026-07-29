import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { nextTick } from 'vue';
import i18n from '../../i18n';
import { zkApi } from '../../api/zk';
import ZkList from './ZkList.vue';

vi.mock('../../api/zk', () => ({
  zkApi: {
    listChildren: vi.fn(),
    createNode: vi.fn(),
    createNodeRecursive: vi.fn(),
  },
}));

vi.mock('../../api/appData', () => ({
  appDataApi: {
    addLog: vi.fn().mockResolvedValue(undefined),
    clearLogs: vi.fn().mockResolvedValue(undefined),
    listLogs: vi.fn().mockResolvedValue({ logs: [], totalCount: 0 }),
  },
}));

type ChildrenByPath = Record<string, string[]>;

const FILTER_DEBOUNCE_MS = 300;

const mountZkList = async (childrenByPath: ChildrenByPath, pinia: Pinia = createPinia()) => {
  vi.mocked(zkApi.listChildren).mockImplementation(async (_connectionUuid, path) => {
    return childrenByPath[path] ?? [];
  });

  setActivePinia(pinia);

  const wrapper = mount(ZkList, {
    props: {
      connectionUuid: 'conn-a',
      connected: true,
    },
    global: {
      plugins: [pinia, i18n],
      stubs: {
        Dialog: { template: '<div />' },
        ListNode: {
          props: ['node'],
          template: '<div data-testid="list-node">{{ node.name }}</div>',
        },
      },
    },
  });

  await flushPromises();
  await nextTick();
  return wrapper;
};

const renderedNodes = (wrapper: VueWrapper) =>
  wrapper.findAll('[data-testid="list-node"]').map(node => node.text());

const filterInput = (wrapper: VueWrapper) => wrapper.get('[data-testid="znode-list-filter"]');

const pathInput = (wrapper: VueWrapper) => wrapper.get('input[placeholder="/path/to/node"]');

describe('ZkList local filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('groups path navigation separately from list actions', async () => {
    const wrapper = await mountZkList({
      '/': ['alpha'],
    });

    const pathToolbar = wrapper.get('[data-testid="zk-path-toolbar"]');
    const listToolbar = wrapper.get('[data-testid="zk-list-toolbar"]');

    expect(pathToolbar.find('button[title="Go to parent"]').exists()).toBe(true);
    expect(pathToolbar.find('button[title="Go to path"]').exists()).toBe(true);
    expect(pathToolbar.find('button[title="Refresh"]').exists()).toBe(false);
    expect(pathToolbar.find('[data-testid="znode-list-filter"]').exists()).toBe(false);

    expect(listToolbar.find('[data-testid="znode-list-filter"]').exists()).toBe(true);
    expect(listToolbar.find('button[title="Refresh"]').exists()).toBe(true);
    expect(listToolbar.find('button[title="Create Node"]').exists()).toBe(true);
    expect(listToolbar.find('button[title="Go to path"]').exists()).toBe(false);

    wrapper.unmount();
  });

  it('debounces filtering by node name', async () => {
    const wrapper = await mountZkList({
      '/': ['alpha', 'beta', 'gamma'],
    });

    expect(renderedNodes(wrapper)).toEqual(['alpha', 'beta', 'gamma']);

    await filterInput(wrapper).setValue('alp');
    expect(renderedNodes(wrapper)).toEqual(['alpha', 'beta', 'gamma']);

    await vi.advanceTimersByTimeAsync(FILTER_DEBOUNCE_MS - 1);
    expect(renderedNodes(wrapper)).toEqual(['alpha', 'beta', 'gamma']);

    await vi.advanceTimersByTimeAsync(1);
    expect(renderedNodes(wrapper)).toEqual(['alpha']);

    wrapper.unmount();
  });

  it('applies filtering immediately on enter', async () => {
    const wrapper = await mountZkList({
      '/': ['alpha', 'beta', 'gamma'],
    });

    await filterInput(wrapper).setValue('bet');
    await filterInput(wrapper).trigger('keydown.enter');
    await nextTick();

    expect(renderedNodes(wrapper)).toEqual(['beta']);

    wrapper.unmount();
  });

  it('keeps filtering across path navigation and refresh, then clears when input is empty', async () => {
    const childrenByPath: ChildrenByPath = {
      '/': ['appRoot', 'alpha', 'beta'],
      '/alpha': ['apple', 'banana', 'service'],
    };
    const wrapper = await mountZkList(childrenByPath);

    await filterInput(wrapper).setValue('app');
    await vi.advanceTimersByTimeAsync(FILTER_DEBOUNCE_MS);
    expect(renderedNodes(wrapper)).toEqual(['appRoot']);

    await pathInput(wrapper).setValue('/alpha');
    await pathInput(wrapper).trigger('keydown', { key: 'Enter' });
    await flushPromises();
    await nextTick();
    expect(renderedNodes(wrapper)).toEqual(['apple']);

    childrenByPath['/alpha'] = ['apple', 'appTwo', 'banana'];
    await wrapper.get('button[title="Refresh"]').trigger('click');
    await flushPromises();
    await nextTick();
    expect(renderedNodes(wrapper)).toEqual(['apple', 'appTwo']);

    await filterInput(wrapper).setValue('');
    await vi.advanceTimersByTimeAsync(FILTER_DEBOUNCE_MS);
    expect(renderedNodes(wrapper)).toEqual(['apple', 'appTwo', 'banana']);

    wrapper.unmount();
  });

  it('restores the current path after the connected list is collapsed and expanded again', async () => {
    const childrenByPath: ChildrenByPath = {
      '/': ['config'],
      '/config/123': ['child'],
    };
    const pinia = createPinia();
    const firstWrapper = await mountZkList(childrenByPath, pinia);

    await pathInput(firstWrapper).setValue('/config/123');
    await pathInput(firstWrapper).trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect((pathInput(firstWrapper).element as HTMLInputElement).value).toBe('/config/123');

    firstWrapper.unmount();
    const secondWrapper = await mountZkList(childrenByPath, pinia);

    expect((pathInput(secondWrapper).element as HTMLInputElement).value).toBe('/config/123');
    expect(vi.mocked(zkApi.listChildren)).toHaveBeenLastCalledWith('conn-a', '/config/123');

    secondWrapper.unmount();
  });
});
