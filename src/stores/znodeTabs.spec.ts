import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useZnodeTabsStore } from './znodeTabs';
import type { ZnodeTab } from './znodeTabs';

describe('ZnodeTabs Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  const createMockTab = (path: string): ZnodeTab => ({
    connectionUuid: 'test-uuid',
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
    
    store.makePermanent('/temp');
    expect(store.activeTab?.isTemporary).toBe(false);
  });

  it('deletes a tab and updates active tab', () => {
    const store = useZnodeTabsStore();
    store.addTab(createMockTab('/tab1'));
    store.addTab(createMockTab('/tab2'));
    
    expect(store.activeTab?.path).toBe('/tab2');
    store.delTab('/tab2');
    
    expect(store.znodeTabs.length).toBe(1);
    expect(store.activeTab?.path).toBe('/tab1');
  });

  it('updates tab data correctly', () => {
    const store = useZnodeTabsStore();
    store.addTab(createMockTab('/tab1'));
    
    store.updateTab('/tab1', { znodeData: [1, 2, 3] });
    expect(store.activeTab?.znodeData).toEqual([1, 2, 3]);
  });
});
