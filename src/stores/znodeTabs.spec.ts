import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useZnodeTabsStore } from './znodeTabs';
import type { ZnodeTab } from './znodeTabs';

describe('ZnodeTabs Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  const createMockTab = (path: string, connectionUuid = 'test-uuid'): ZnodeTab => ({
    connectionUuid,
    path,
    znodeData: [],
    stat: null,
    acl: [],
    isActive: false,
    isTemporary: false,
  });

  it('adds a new permanent tab correctly', () => {
    const store = useZnodeTabsStore();
    const tab1 = createMockTab('/tab1');
    
    // addTab sets it to permanent and active
    const existed = store.addTab(tab1);
    
    expect(existed).toBe(false);
    expect(store.znodeTabs.length).toBe(1);
    expect(store.activeTab).toBeTruthy();
    expect(store.activeTab?.path).toBe('/tab1');
    expect(store.activeTab?.isTemporary).toBe(false);
  });

  it('adds a temporary tab', () => {
    const store = useZnodeTabsStore();
    const tab1 = createMockTab('/temp');
    
    store.replaceOrCreateTemporaryTab(tab1);
    
    expect(store.znodeTabs.length).toBe(1);
    expect(store.activeTab?.path).toBe('/temp');
    expect(store.activeTab?.isTemporary).toBe(true);
  });

  it('replaces temporary tab with another temporary tab', () => {
    const store = useZnodeTabsStore();
    
    store.replaceOrCreateTemporaryTab(createMockTab('/temp1'));
    expect(store.znodeTabs.length).toBe(1);
    expect(store.activeTab?.path).toBe('/temp1');
    
    store.replaceOrCreateTemporaryTab(createMockTab('/temp2'));
    expect(store.znodeTabs.length).toBe(1);
    expect(store.activeTab?.path).toBe('/temp2');
  });

  it('keeps permanent tab and creates temporary alongside it', () => {
    const store = useZnodeTabsStore();
    
    store.addTab(createMockTab('/perm1')); // this is permanent
    store.replaceOrCreateTemporaryTab(createMockTab('/temp1')); // this is temp
    
    expect(store.znodeTabs.length).toBe(2);
    expect(store.activeTab?.path).toBe('/temp1');
    
    store.replaceOrCreateTemporaryTab(createMockTab('/temp2'));
    expect(store.znodeTabs.length).toBe(2);
    expect(store.activeTab?.path).toBe('/temp2'); // temp1 replaced by temp2
  });

  it('makes a temporary tab permanent', () => {
    const store = useZnodeTabsStore();
    store.replaceOrCreateTemporaryTab(createMockTab('/temp'));
    expect(store.activeTab?.isTemporary).toBe(true);
    
    store.makePermanent('test-uuid', '/temp');
    expect(store.activeTab?.isTemporary).toBe(false);
  });

  it('deletes a tab and updates active tab', () => {
    const store = useZnodeTabsStore();
    store.addTab(createMockTab('/tab1'));
    store.addTab(createMockTab('/tab2'));
    
    expect(store.activeTab?.path).toBe('/tab2');
    store.delTab('test-uuid', '/tab2');
    
    expect(store.znodeTabs.length).toBe(1);
    expect(store.activeTab?.path).toBe('/tab1');
  });

  it('updates tab data correctly', () => {
    const store = useZnodeTabsStore();
    store.addTab(createMockTab('/tab1'));
    
    store.updateTab('test-uuid', '/tab1', { znodeData: [1, 2, 3] });
    expect(store.activeTab?.znodeData).toEqual([1, 2, 3]);
  });

  it('keeps tabs with the same path isolated by connection', () => {
    const store = useZnodeTabsStore();

    store.addTab(createMockTab('/shared', 'conn-a'));
    store.addTab(createMockTab('/shared', 'conn-b'));

    expect(store.znodeTabs.length).toBe(2);

    store.updateTab('conn-a', '/shared', { znodeData: [1] });
    store.setDirty('conn-b', '/shared', true);

    const connA = store.znodeTabs.find(tab => tab.connectionUuid === 'conn-a' && tab.path === '/shared');
    const connB = store.znodeTabs.find(tab => tab.connectionUuid === 'conn-b' && tab.path === '/shared');

    expect(connA?.znodeData).toEqual([1]);
    expect(connA?.isDirty).toBe(false);
    expect(connB?.znodeData).toEqual([]);
    expect(connB?.isDirty).toBe(true);

    store.delTab('conn-a', '/shared');

    expect(store.znodeTabs.length).toBe(1);
    expect(store.znodeTabs[0].connectionUuid).toBe('conn-b');
  });

  it('detects and closes dirty tabs by subtree prefix', () => {
    const store = useZnodeTabsStore();

    store.addTab(createMockTab('/parent', 'conn-a'));
    store.addTab(createMockTab('/parent/child', 'conn-a'));
    store.addTab(createMockTab('/parent-sibling', 'conn-a'));
    store.addTab(createMockTab('/parent/child', 'conn-b'));
    store.setDirty('conn-a', '/parent/child', true);

    expect(store.hasDirtyTabsByPathPrefix('conn-a', '/parent')).toBe(true);
    expect(store.hasDirtyTabsByPathPrefix('conn-a', '/parent-sibling')).toBe(false);

    store.closeTabsByPathPrefix('conn-a', '/parent');

    expect(store.znodeTabs.map(tab => `${tab.connectionUuid}:${tab.path}`)).toEqual([
      'conn-a:/parent-sibling',
      'conn-b:/parent/child',
    ]);
  });
});
