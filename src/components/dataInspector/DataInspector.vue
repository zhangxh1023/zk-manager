<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useZnodeTabsStore } from '../../stores/znodeTabs';
import { useLogsStore } from '../../stores/logs';
import { useZkTreeStore } from '../../stores/zkTree';
import { zkApi } from '../../api/zk';
import { RefreshCw } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog';
import type { ZnodeTab } from '../../stores/znodeTabs';
import type { ZkAclEntry } from '../../types/znodeDetails';
import { showToast } from '../../utils/toast';
import { formatBytes, parseBytes, type SerializationFormat } from '../../utils/serializer';

// Viewer components
import TextViewer from './components/TextViewer.vue';
import JSONViewer from './components/JSONViewer.vue';
import XMLViewer from './components/XMLViewer.vue';
import HexViewer from './components/HexViewer.vue';
import BinaryViewer from './components/BinaryViewer.vue';

const { t } = useI18n();

const props = defineProps<{
  tab: ZnodeTab;
}>();

const znodeTabsStore = useZnodeTabsStore();
const logsStore = useLogsStore();
const zkTreeStore = useZkTreeStore();

// Format selector
const dataFormat = ref<SerializationFormat>('text');
const editValue = ref('');
const isSubmitting = ref(false);
const errorMessage = ref('');
const originalValue = ref<string | null>(null);

// Create child dialog
const showCreateDialog = ref(false);
const newNodeName = ref('');
const newNodeData = ref('');

// ACL editing
const editingAcl = ref<ZkAclEntry | null>(null);
const showAclDialog = ref(false);

// Delete dialog
const showDeleteDialog = ref(false);

const FORMAT_OPTIONS: { value: SerializationFormat; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'json', label: 'JSON' },
  { value: 'xml', label: 'XML' },
  { value: 'hex', label: 'Hex' },
  { value: 'binary', label: 'Binary' },
];

const formatTimestamp = (value: number) => {
  if (!value) return '-';
  return new Date(value).toLocaleString();
};

// Update editValue when format or data changes
watch(
  () => [props.tab.znodeData, dataFormat.value],
  () => {
    const result = formatBytes(props.tab.znodeData, dataFormat.value);
    if (result.success && result.data !== undefined) {
      editValue.value = result.data;
      originalValue.value = result.data;
      errorMessage.value = '';
    } else {
      errorMessage.value = result.error || 'Failed to format data';
    }
  },
  { immediate: true },
);

// Track dirtiness
watch(editValue, (newVal) => {
  if (originalValue.value !== null) {
    znodeTabsStore.setDirty(props.tab.path, newVal !== originalValue.value);
  }
});

// Also update when tab changes (different node selected)
watch(
  () => props.tab.path,
  () => {
    const result = formatBytes(props.tab.znodeData, dataFormat.value);
    if (result.success && result.data !== undefined) {
      editValue.value = result.data;
      originalValue.value = result.data;
      errorMessage.value = '';
    }
  },
);

const statRows = computed(() => {
  if (!props.tab.stat) return [];
  return [
    ['czxid', String(props.tab.stat.czxid)],
    ['mzxid', String(props.tab.stat.mzxid)],
    ['pzxid', String(props.tab.stat.pzxid)],
    ['ctime', formatTimestamp(props.tab.stat.ctime)],
    ['mtime', formatTimestamp(props.tab.stat.mtime)],
    ['version', String(props.tab.stat.version)],
    ['cversion', String(props.tab.stat.cversion)],
    ['aversion', String(props.tab.stat.aversion)],
    ['ephemeralOwner', String(props.tab.stat.ephemeralOwner)],
    ['dataLength', String(props.tab.stat.dataLength)],
    ['numChildren', String(props.tab.stat.numChildren)],
  ];
});

const refresh = async () => {
  isSubmitting.value = true;
  errorMessage.value = '';
  try {
    const details = await zkApi.getDetails(props.tab.connectionUuid, props.tab.path);
    znodeTabsStore.updateTab(props.tab.path, {
      znodeData: details.data,
      stat: details.stat,
      acl: details.acl,
    });
    await logsStore.addLog('current', 'REFRESH', `Refreshed node ${props.tab.path}`);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    isSubmitting.value = false;
  }
};

const save = async () => {
  isSubmitting.value = true;
  errorMessage.value = '';
  try {
    // Convert edit value back to bytes using current format
    const result = parseBytes(editValue.value, dataFormat.value);
    if (!result.success || !result.bytes) {
      errorMessage.value = result.error || 'Failed to parse data';
      isSubmitting.value = false;
      return;
    }

    const details = await zkApi.setData(props.tab.connectionUuid, props.tab.path, result.bytes);
    znodeTabsStore.updateTab(props.tab.path, {
      znodeData: details.data,
      stat: details.stat,
      acl: details.acl,
    });
    znodeTabsStore.setDirty(props.tab.path, false);
    await logsStore.addLog('current', 'SET_DATA', `Updated data of ${props.tab.path}`);
    showToast.success(t('node.saveSuccess'));
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    showToast.error(errorMsg);
  } finally {
    isSubmitting.value = false;
  }
};

const removeNode = async () => {
  isSubmitting.value = true;
  errorMessage.value = '';
  try {
    await zkApi.deleteNode(props.tab.connectionUuid, props.tab.path);
    await logsStore.addLog('current', 'DELETE', `Deleted node ${props.tab.path}`);
    await zkTreeStore.onNodeDeleted(props.tab.connectionUuid, props.tab.path);
    znodeTabsStore.delTab(props.tab.path);
    showDeleteDialog.value = false;
    showToast.success(t('node.deleteSuccess'));
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    showToast.error(errorMsg);
  } finally {
    isSubmitting.value = false;
  }
};

// Open create child dialog
const openCreateDialog = () => {
  newNodeName.value = '';
  newNodeData.value = '';
  showCreateDialog.value = true;
};

// Locate this node in the tree (expand path and scroll to it)
const locateInTree = async () => {
  await zkTreeStore.locateNode(props.tab.connectionUuid, props.tab.path);
};

// Create child node
const createChildNode = async () => {
  if (!newNodeName.value.trim()) {
    errorMessage.value = 'Node name cannot be empty';
    return;
  }
  const childPath = props.tab.path === '/' ? `/${newNodeName.value.trim()}` : `${props.tab.path}/${newNodeName.value.trim()}`;
  isSubmitting.value = true;
  errorMessage.value = '';
  try {
    const encoder = new TextEncoder();
    const data = Array.from(encoder.encode(newNodeData.value));
    await zkApi.createNode(props.tab.connectionUuid, childPath, data);
    await logsStore.addLog('current', 'CREATE', `Created node ${childPath}`);
    await zkTreeStore.onNodeCreated(props.tab.connectionUuid, props.tab.path);
    showCreateDialog.value = false;
    showToast.success(t('node.createSuccess', { path: childPath }));
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    await logsStore.addLog('current', 'CREATE', `Failed to create node ${childPath}: ${errMsg}`, false);
    showToast.error(errMsg);
  } finally {
    isSubmitting.value = false;
  }
};

// ACL operations
const openEditAcl = (acl: ZkAclEntry) => {
  editingAcl.value = { ...acl };
  showAclDialog.value = true;
};

const addNewAcl = () => {
  editingAcl.value = { scheme: 'world', id: 'anyone', permission: 'ALL' };
  showAclDialog.value = true;
};

const saveAcl = async () => {
  if (!editingAcl.value) return;
  isSubmitting.value = true;
  errorMessage.value = '';
  try {
    const newAclList = [...props.tab.acl.filter(a =>
      !(a.scheme === editingAcl.value!.scheme && a.id === editingAcl.value!.id),
    ), editingAcl.value];
    await zkApi.setAcl(props.tab.connectionUuid, props.tab.path, newAclList);
    const details = await zkApi.getDetails(props.tab.connectionUuid, props.tab.path);
    znodeTabsStore.updateTab(props.tab.path, { acl: details.acl });
    await logsStore.addLog('current', 'SET_ACL', `Updated ACL of ${props.tab.path}`);
    showAclDialog.value = false;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    isSubmitting.value = false;
  }
};

const deleteAcl = async (acl: ZkAclEntry) => {
  if (!window.confirm(t('acl.confirmDelete'))) return;
  isSubmitting.value = true;
  errorMessage.value = '';
  try {
    const newAclList = props.tab.acl.filter(a =>
      !(a.scheme === acl.scheme && a.id === acl.id),
    );
    await zkApi.setAcl(props.tab.connectionUuid, props.tab.path, newAclList);
    const details = await zkApi.getDetails(props.tab.connectionUuid, props.tab.path);
    znodeTabsStore.updateTab(props.tab.path, { acl: details.acl });
    await logsStore.addLog('current', 'DELETE_ACL', `Deleted ACL from ${props.tab.path}`);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    isSubmitting.value = false;
  }
};

const PERMISSION_OPTIONS = ['READ', 'WRITE', 'CREATE', 'DELETE', 'ADMIN', 'ALL'];
const SCHEME_OPTIONS = ['world', 'auth', 'digest'];

const getNodeName = (path: string) => {
  if (path === '/') return '/';
  const parts = path.split('/');
  return parts[parts.length - 1];
};
</script>

<template>
  <div class="h-full flex flex-col bg-background">
    <!-- Header Area -->
    <div class="flex items-center justify-between p-4 bg-sidebar-accent/10 border-b border-sidebar-border transition-colors">
      <div class="flex flex-col gap-1 min-w-0">
        <h2 class="text-base font-semibold tracking-tight truncate flex items-center gap-2">
          {{ getNodeName(tab.path) }}
          <span class="text-xs font-medium text-muted-foreground px-1.5 py-0.5 rounded-md bg-sidebar-accent border border-sidebar-border/50">Node</span>
        </h2>
        <div
          class="text-xs text-muted-foreground font-mono truncate flex items-center gap-1.5 opacity-80"
          title="Full Path"
        >
          <span class="text-primary/70 select-none font-bold">PATH</span> {{ tab.path }}
        </div>
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        <Button
          variant="outline"
          size="sm"
          :disabled="isSubmitting"
          class="h-7 px-2.5 shadow-sm text-xs border-sidebar-border"
          @click="refresh"
        >
          <RefreshCw class="size-3 mr-1.5" /> {{ t('tabs.refresh') }}
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="h-7 px-2.5 shadow-sm text-xs border-sidebar-border"
          @click="locateInTree"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="lucide lucide-locate-fixed size-3 mr-1.5"
          ><line
            x1="2"
            x2="5"
            y1="12"
            y2="12"
          /><line
            x1="19"
            x2="22"
            y1="12"
            y2="12"
          /><line
            x1="12"
            x2="12"
            y1="2"
            y2="5"
          /><line
            x1="12"
            x2="12"
            y1="19"
            y2="22"
          /><circle
            cx="12"
            cy="12"
            r="7"
          /><circle
            cx="12"
            cy="12"
            r="3"
          /></svg>
          {{ t('tabs.locate') }}
        </Button>
        <div class="w-[1px] h-4 bg-sidebar-border mx-1" />
        <Button
          variant="ghost"
          size="icon"
          :disabled="isSubmitting"
          class="h-7 w-7 text-muted-foreground hover:text-foreground"
          @click="openCreateDialog"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="lucide lucide-plus size-4"
          ><path d="M5 12h14" /><path d="M12 5v14" /></svg>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          :disabled="isSubmitting"
          class="h-7 w-7 text-muted-foreground hover:text-destructive"
          @click="showDeleteDialog = true"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="lucide lucide-trash-2 size-4"
          ><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line
            x1="10"
            x2="10"
            y1="11"
            y2="17"
          /><line
            x1="14"
            x2="14"
            y1="11"
            y2="17"
          /></svg>
        </Button>
      </div>
    </div>

    <!-- Tabs -->
    <Tabs
      default-value="Data"
      class="flex-1 overflow-hidden flex flex-col"
    >
      <div class="px-4 pt-3 border-b border-sidebar-border/50">
        <TabsList class="w-[300px] h-9 grid grid-cols-3 bg-sidebar-accent/50 p-1">
          <TabsTrigger
            value="Data"
            class="text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            {{ t('tabs.data') }}
          </TabsTrigger>
          <TabsTrigger
            value="ACL"
            class="text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            {{ t('tabs.acl') }}
          </TabsTrigger>
          <TabsTrigger
            value="Meta"
            class="text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            {{ t('tabs.meta') }}
          </TabsTrigger>
        </TabsList>
      </div>

      <!-- Data Tab -->
      <TabsContent
        value="Data"
        class="flex flex-col flex-1 min-h-0 bg-background outline-none m-0"
      >
        <div class="flex items-center gap-2 p-2 px-4 shrink-0 bg-sidebar-accent/5 border-b border-sidebar-border/50">
          <Button
            size="sm"
            :disabled="isSubmitting"
            @click="save"
          >
            {{ t('tabs.save') }}
          </Button>
          <Select v-model="dataFormat">
            <SelectTrigger class="w-32">
              <SelectValue placeholder="Format" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem
                  v-for="opt in FORMAT_OPTIONS"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div class="flex-1 min-h-0 p-2 overflow-auto">
          <TextViewer
            v-if="dataFormat === 'text'"
            v-model="editValue"
          />
          <JSONViewer
            v-else-if="dataFormat === 'json'"
            v-model="editValue"
          />
          <XMLViewer
            v-else-if="dataFormat === 'xml'"
            v-model="editValue"
          />
          <HexViewer
            v-else-if="dataFormat === 'hex'"
            v-model="editValue"
          />
          <BinaryViewer
            v-else-if="dataFormat === 'binary'"
            v-model="editValue"
          />
        </div>
        <p
          v-if="errorMessage"
          class="px-2 text-sm text-red-500 shrink-0"
        >
          {{ errorMessage }}
        </p>
      </TabsContent>

      <!-- ACL Tab -->
      <TabsContent
        value="ACL"
        class="flex-1 overflow-auto"
      >
        <div class="p-2">
          <Button
            size="sm"
            class="mb-2"
            @click="addNewAcl"
          >
            {{ t('acl.add') }}
          </Button>
          <div class="space-y-2">
            <div
              v-for="(acl, index) in tab.acl"
              :key="`${acl.scheme}-${acl.id}-${index}`"
              class="flex items-center justify-between border rounded p-3"
            >
              <div class="text-sm space-y-1">
                <div><span class="font-medium">{{ t('acl.scheme') }}:</span> {{ acl.scheme }}</div>
                <div><span class="font-medium">{{ t('acl.id') }}:</span> {{ acl.id }}</div>
                <div><span class="font-medium">{{ t('acl.permission') }}:</span> {{ acl.permission }}</div>
              </div>
              <div class="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  @click="openEditAcl(acl)"
                >
                  {{ t('acl.edit') }}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  @click="deleteAcl(acl)"
                >
                  {{ t('acl.delete') }}
                </Button>
              </div>
            </div>
            <p
              v-if="!tab.acl.length"
              class="text-sm text-muted-foreground"
            >
              no acl data
            </p>
          </div>
        </div>
      </TabsContent>

      <!-- Meta Tab -->
      <TabsContent
        value="Meta"
        class="flex-1 overflow-auto"
      >
        <div class="space-y-2 p-2 text-sm">
          <div
            v-for="[label, value] in statRows"
            :key="label"
            class="flex justify-between gap-4 border rounded px-3 py-2"
          >
            <span class="font-medium">{{ t(`meta.${label}`) || label }}</span>
            <span class="text-right break-all">{{ value }}</span>
          </div>
        </div>
      </TabsContent>
    </Tabs>

    <!-- Create Child Dialog -->
    <Dialog v-model:open="showCreateDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ t('createNode.title') }}</DialogTitle>
        </DialogHeader>
        <div class="space-y-4 py-4">
          <div>
            <Label
              for="nodeName"
              class="text-xs uppercase tracking-wider font-semibold text-muted-foreground"
            >{{ t('createNode.nodeName') }}</Label>
            <Input
              id="nodeName"
              v-model="newNodeName"
              :placeholder="t('createNode.placeholder.name')"
            />
          </div>
          <div>
            <Label
              for="nodeData"
              class="text-xs uppercase tracking-wider font-semibold text-muted-foreground"
            >{{ t('createNode.nodeData') }}</Label>
            <Textarea
              id="nodeData"
              v-model="newNodeData"
              :placeholder="t('createNode.placeholder.data')"
              class="font-mono text-xs"
            />
          </div>
          <p
            v-if="errorMessage"
            class="text-sm text-red-500"
          >
            {{ errorMessage }}
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            @click="showCreateDialog = false"
          >
            {{ t('connection.cancel') }}
          </Button>
          <Button
            :disabled="isSubmitting"
            @click="createChildNode"
          >
            {{ t('connection.save') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- ACL Edit Dialog -->
    <Dialog v-model:open="showAclDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ t('acl.edit') }} ACL</DialogTitle>
        </DialogHeader>
        <div
          v-if="editingAcl"
          class="space-y-3 py-4"
        >
          <div>
            <Label class="text-xs uppercase tracking-wider font-semibold text-muted-foreground">{{ t('acl.scheme') }}</Label>
            <Select v-model="editingAcl.scheme">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem
                    v-for="s in SCHEME_OPTIONS"
                    :key="s"
                    :value="s"
                  >
                    {{ s }}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label class="text-xs uppercase tracking-wider font-semibold text-muted-foreground">{{ t('acl.id') }}</Label>
            <Input v-model="editingAcl.id" />
          </div>
          <div>
            <Label class="text-xs uppercase tracking-wider font-semibold text-muted-foreground">{{ t('acl.permission') }}</Label>
            <Select v-model="editingAcl.permission">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem
                    v-for="p in PERMISSION_OPTIONS"
                    :key="p"
                    :value="p"
                  >
                    {{ p }}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            @click="showAclDialog = false"
          >
            {{ t('connection.cancel') }}
          </Button>
          <Button
            :disabled="isSubmitting"
            @click="saveAcl"
          >
            {{ t('connection.save') }}
          </Button>
        </DialogFooter>
        <p
          v-if="errorMessage"
          class="text-sm text-red-500"
        >
          {{ errorMessage }}
        </p>
      </DialogContent>
    </Dialog>

    <!-- Delete Confirmation Dialog -->
    <Dialog v-model:open="showDeleteDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ t('node.confirmDeleteTitle') }}</DialogTitle>
        </DialogHeader>
        <div class="py-4">
          <p class="text-sm text-muted-foreground">
            {{ t('node.confirmDeleteMsg', { path: tab.path }) }}
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            @click="showDeleteDialog = false"
          >
            {{ t('connection.cancel') }}
          </Button>
          <Button
            variant="destructive"
            :disabled="isSubmitting"
            @click="removeNode"
          >
            {{ t('node.delete') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
