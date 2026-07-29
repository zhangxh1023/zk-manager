import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import i18n from '../../i18n';
import { appDataApi } from '../../api/appData';
import {
  buildZnodeImportPlan,
  findZnodeImportConflicts,
  importZnodeSubtree,
  selectZnodeImportFile,
  type SelectedZnodeImportFile,
  type ZnodeImportPlan,
} from '../../composables/useZnodeImport';
import { useZkTreeStore } from '../../stores/zkTree';
import { showToast } from '../../utils/toast';
import ZnodeRestoreDialog from './ZnodeRestoreDialog.vue';

vi.mock('../../api/appData', () => ({
  appDataApi: {
    addLog: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../composables/useZnodeImport', () => ({
  buildZnodeImportPlan: vi.fn(),
  findZnodeImportConflicts: vi.fn(),
  importZnodeSubtree: vi.fn(),
  selectZnodeImportFile: vi.fn(),
}));

vi.mock('../../utils/toast', () => ({
  showToast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const selectedFile: SelectedZnodeImportFile = {
  filePath: '/tmp/app-backup.json',
  fileName: 'app-backup.json',
  exportFile: {
    schema: 'zk-manager.znode-export',
    version: 1,
    exportedAt: '2026-06-16T01:02:03.000Z',
    rootPath: '/app',
    nodeCount: 2,
    nodes: [],
  },
};

const importPlan: ZnodeImportPlan = {
  sourceRootPath: '/app',
  targetRootPath: '/restored/app',
  nodes: [],
};

const stubWithSlot = { template: '<div><slot /></div>' };
const buttonStub = {
  props: ['variant'],
  template: '<button type="button" :data-variant="variant"><slot /></button>',
};
const inputStub = {
  inheritAttrs: false,
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: `
    <input
      v-bind="$attrs"
      :value="modelValue"
      @input="$emit('update:modelValue', $event.target.value)"
    >
  `,
};

const mountDialog = () => {
  const pinia = createPinia();
  setActivePinia(pinia);
  const treeStore = useZkTreeStore();
  vi.spyOn(treeStore, 'onNodeCreatedAtPath').mockResolvedValue();

  const wrapper = mount(ZnodeRestoreDialog, {
    props: {
      connectionName: 'Production',
      connectionUuid: 'conn-a',
      open: true,
    },
    global: {
      plugins: [pinia, i18n],
      stubs: {
        Button: buttonStub,
        Dialog: stubWithSlot,
        DialogContent: stubWithSlot,
        DialogFooter: stubWithSlot,
        DialogHeader: stubWithSlot,
        DialogTitle: stubWithSlot,
        Input: inputStub,
        Label: stubWithSlot,
      },
    },
  });

  return { treeStore, wrapper };
};

const chooseFile = async (wrapper: VueWrapper) => {
  await wrapper.get('[data-testid="restore-choose-file"]').trigger('click');
  await flushPromises();
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(selectZnodeImportFile).mockResolvedValue(selectedFile);
  vi.mocked(buildZnodeImportPlan).mockReturnValue(importPlan);
  vi.mocked(findZnodeImportConflicts).mockResolvedValue([]);
  vi.mocked(importZnodeSubtree).mockResolvedValue({
    totalCount: 2,
    createdCount: 2,
    overwrittenCount: 0,
    skippedCount: 0,
  });
});

describe('ZnodeRestoreDialog', () => {
  it('progressively reveals restore options and defaults to the original path with skip policy', async () => {
    const { wrapper } = mountDialog();

    expect(wrapper.find('[data-testid="restore-target-path"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="restore-conflict-policy"]').exists()).toBe(false);

    await chooseFile(wrapper);

    expect(wrapper.get('[data-testid="restore-file-summary"]').text())
      .toContain('Original path /app · 2 nodes');
    expect((wrapper.get('[data-testid="restore-target-path"]').element as HTMLInputElement).value)
      .toBe('/app');
    expect((wrapper.get('[data-testid="restore-conflict-policy"]').element as HTMLSelectElement).value)
      .toBe('skip');
  });

  it('keeps the initial state when file selection is cancelled and reports invalid files', async () => {
    const { wrapper } = mountDialog();
    vi.mocked(selectZnodeImportFile).mockResolvedValueOnce(null);

    await chooseFile(wrapper);

    expect(wrapper.find('[data-testid="restore-target-path"]').exists()).toBe(false);
    expect(showToast.error).not.toHaveBeenCalled();

    vi.mocked(selectZnodeImportFile).mockRejectedValueOnce(new Error('bad schema'));
    await chooseFile(wrapper);

    expect(wrapper.find('[data-testid="restore-target-path"]').exists()).toBe(false);
    expect(showToast.error).toHaveBeenCalledWith('Could not read backup file: bad schema');
  });

  it('shows an inline conflict review when existing nodes will be skipped', async () => {
    const { wrapper } = mountDialog();
    vi.mocked(findZnodeImportConflicts).mockResolvedValue(['/app', '/app/config']);
    await chooseFile(wrapper);

    await wrapper.get('[data-testid="restore-submit"]').trigger('click');
    await flushPromises();

    const conflictReview = wrapper.get('[data-testid="restore-conflict-review"]');
    expect(conflictReview.text()).toContain('2 existing nodes found');
    expect(conflictReview.text()).toContain('/app');
    expect(wrapper.get('[data-testid="restore-confirm"]').attributes('data-variant'))
      .toBe('default');
    expect(importZnodeSubtree).not.toHaveBeenCalled();
    expect(wrapper.emitted('update:open')).toBeUndefined();

    await wrapper.findAll('button').find(button => button.text() === 'Back')?.trigger('click');
    expect(wrapper.find('[data-testid="restore-conflict-review"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="restore-target-path"]').exists()).toBe(true);
  });

  it('restores to a remapped path after destructive inline confirmation for overwrite', async () => {
    const { treeStore, wrapper } = mountDialog();
    vi.mocked(findZnodeImportConflicts).mockResolvedValue(['/restored/app']);
    vi.mocked(importZnodeSubtree).mockResolvedValue({
      totalCount: 2,
      createdCount: 1,
      overwrittenCount: 1,
      skippedCount: 0,
    });
    await chooseFile(wrapper);
    await wrapper.get('[data-testid="restore-target-path"]').setValue('/restored/app');
    await wrapper.get('[data-testid="restore-conflict-policy"]').setValue('overwrite');

    await wrapper.get('[data-testid="restore-submit"]').trigger('click');
    await flushPromises();

    expect(buildZnodeImportPlan).toHaveBeenCalledWith(selectedFile.exportFile, '/restored/app');
    expect(wrapper.get('[data-testid="restore-confirm"]').attributes('data-variant'))
      .toBe('destructive');

    await wrapper.get('[data-testid="restore-confirm"]').trigger('click');
    await flushPromises();

    expect(importZnodeSubtree).toHaveBeenCalledWith({
      connectionUuid: 'conn-a',
      plan: importPlan,
      conflictPolicy: 'overwrite',
      existingPaths: ['/restored/app'],
    });
    expect(appDataApi.addLog).toHaveBeenCalledWith(
      'Production',
      'IMPORT',
      'Restored /tmp/app-backup.json to /restored/app: 1 created, 1 overwritten, 0 skipped',
      true,
    );
    expect(treeStore.onNodeCreatedAtPath).toHaveBeenCalledWith(
      'conn-a',
      '/restored/app',
      {
        invalidateAncestors: true,
        refreshCurrentPath: true,
      },
    );
    expect(wrapper.emitted('update:open')).toEqual([[false]]);
    expect(showToast.success).toHaveBeenCalledWith(
      'Restore complete: 1 created, 1 overwritten, 0 skipped',
    );
  });

  it('keeps the dialog open and records a failed restore', async () => {
    const { wrapper } = mountDialog();
    vi.mocked(importZnodeSubtree).mockRejectedValue(new Error('connection lost'));
    await chooseFile(wrapper);

    await wrapper.get('[data-testid="restore-submit"]').trigger('click');
    await flushPromises();

    expect(wrapper.emitted('update:open')).toBeUndefined();
    expect(appDataApi.addLog).toHaveBeenCalledWith(
      'Production',
      'IMPORT',
      'Failed to restore /tmp/app-backup.json: connection lost',
      false,
    );
    expect(showToast.error).toHaveBeenCalledWith(
      'Failed to restore from backup: connection lost',
    );
  });
});
