<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useZnodeTabsStore } from '../../stores/znodeTabs';
import { useLogsStore } from '../../stores/logs';
import { zkApi } from '../../api/zk';
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

const { t } = useI18n();

const props = defineProps<{
  tab: ZnodeTab;
}>();

const znodeTabsStore = useZnodeTabsStore();
const logsStore = useLogsStore();

const parser = ref('text');
const editValue = ref('');
const isSubmitting = ref(false);
const errorMessage = ref('');

// Create child dialog
const showCreateDialog = ref(false);
const newNodeName = ref('');
const newNodeData = ref('');

// ACL editing
const editingAcl = ref<ZkAclEntry | null>(null);
const showAclDialog = ref(false);

const formatTimestamp = (value: number) => {
  if (!value) return '-';
  return new Date(value).toLocaleString();
};

const decodeText = (data: number[]) => {
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(new Uint8Array(data));
};

const encodeText = (value: string) => Array.from(new TextEncoder().encode(value));

watch(
  () => [props.tab.path, props.tab.znodeData, parser.value],
  () => {
    editValue.value = decodeText(props.tab.znodeData);
    errorMessage.value = '';
  },
  { immediate: true },
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
    const details = await zkApi.getDetails(props.tab.path);
    props.tab.znodeData = details.data;
    props.tab.stat = details.stat;
    props.tab.acl = details.acl;
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
    const data = encodeText(editValue.value);
    const details = await zkApi.setData(props.tab.path, data);
    props.tab.znodeData = details.data;
    props.tab.stat = details.stat;
    props.tab.acl = details.acl;
    await logsStore.addLog('current', 'SET_DATA', `Updated data of ${props.tab.path}`);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    isSubmitting.value = false;
  }
};

const removeNode = async () => {
  if (!window.confirm(t('node.confirmDelete', { path: props.tab.path }))) return;
  isSubmitting.value = true;
  errorMessage.value = '';
  try {
    await zkApi.deleteNode(props.tab.path);
    await logsStore.addLog('current', 'DELETE', `Deleted node ${props.tab.path}`);
    znodeTabsStore.delTab(props.tab.path);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
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
    const data = encodeText(newNodeData.value);
    await zkApi.createNode(childPath, data);
    await logsStore.addLog('current', 'CREATE', `Created node ${childPath}`);
    showCreateDialog.value = false;
    alert(t('node.createSuccess', { path: childPath }));
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    await logsStore.addLog('current', 'CREATE', `Failed to create node ${childPath}: ${errMsg}`);
    errorMessage.value = errMsg;
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
      !(a.scheme === editingAcl.value!.scheme && a.id === editingAcl.value!.id)
    ), editingAcl.value];
    await zkApi.setAcl(props.tab.path, newAclList);
    const details = await zkApi.getDetails(props.tab.path);
    props.tab.acl = details.acl;
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
      !(a.scheme === acl.scheme && a.id === acl.id)
    );
    await zkApi.setAcl(props.tab.path, newAclList);
    const details = await zkApi.getDetails(props.tab.path);
    props.tab.acl = details.acl;
    await logsStore.addLog('current', 'DELETE_ACL', `Deleted ACL from ${props.tab.path}`);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    isSubmitting.value = false;
  }
};

const PERMISSION_OPTIONS = ['READ', 'WRITE', 'CREATE', 'DELETE', 'ADMIN', 'ALL'];
const SCHEME_OPTIONS = ['world', 'auth', 'digest'];
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Toolbar -->
    <div class="flex items-center gap-2 mb-2 p-2 bg-background rounded">
      <Input
        :model-value="tab.path"
        class="max-w-xs"
        readonly
      />
      <Button
        variant="outline"
        size="sm"
        :disabled="isSubmitting"
        @click="openCreateDialog"
      >
        {{ t('node.createChild') }}
      </Button>
      <Button
        variant="destructive"
        size="sm"
        :disabled="isSubmitting"
        @click="removeNode"
      >
        {{ t('node.delete') }}
      </Button>
      <Button
        variant="outline"
        size="sm"
        :disabled="isSubmitting"
        @click="refresh"
      >
        {{ t('tabs.refresh') }}
      </Button>
    </div>

    <!-- Tabs -->
    <Tabs
      default-value="Data"
      class="flex-1 bg-background rounded p-2 overflow-hidden flex flex-col"
    >
      <TabsList class="w-full">
        <TabsTrigger value="Data">{{ t('tabs.data') }}</TabsTrigger>
        <TabsTrigger value="ACL">{{ t('tabs.acl') }}</TabsTrigger>
        <TabsTrigger value="Meta">{{ t('tabs.meta') }}</TabsTrigger>
      </TabsList>

      <!-- Data Tab -->
      <TabsContent value="Data" class="flex flex-col flex-1 overflow-hidden">
        <div class="flex items-center gap-2 p-2">
          <Button size="sm" :disabled="isSubmitting" @click="save">{{ t('tabs.save') }}</Button>
          <Select v-model="parser">
            <SelectTrigger class="w-32">
              <SelectValue placeholder="Parser" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="text">text</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div class="flex-1 min-h-0 p-2">
          <Textarea
            v-model="editValue"
            class="h-full font-mono text-xs"
          />
        </div>
        <p v-if="errorMessage" class="px-2 text-sm text-red-500">{{ errorMessage }}</p>
      </TabsContent>

      <!-- ACL Tab -->
      <TabsContent value="ACL" class="flex-1 overflow-auto">
        <div class="p-2">
          <Button size="sm" class="mb-2" @click="addNewAcl">{{ t('acl.add') }}</Button>
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
                <Button variant="outline" size="sm" @click="openEditAcl(acl)">{{ t('acl.edit') }}</Button>
                <Button variant="destructive" size="sm" @click="deleteAcl(acl)">{{ t('acl.delete') }}</Button>
              </div>
            </div>
            <p v-if="!tab.acl.length" class="text-sm text-muted-foreground">no acl data</p>
          </div>
        </div>
      </TabsContent>

      <!-- Meta Tab -->
      <TabsContent value="Meta">
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
            <Label for="nodeName">{{ t('createNode.nodeName') }}</Label>
            <Input
              id="nodeName"
              v-model="newNodeName"
              :placeholder="t('createNode.placeholder.name')"
            />
          </div>
          <div>
            <Label for="nodeData">{{ t('createNode.nodeData') }}</Label>
            <Textarea
              id="nodeData"
              v-model="newNodeData"
              :placeholder="t('createNode.placeholder.data')"
              class="font-mono text-xs"
            />
          </div>
          <p v-if="errorMessage" class="text-sm text-red-500">{{ errorMessage }}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showCreateDialog = false">{{ t('connection.cancel') }}</Button>
          <Button @click="createChildNode" :disabled="isSubmitting">{{ t('connection.save') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- ACL Edit Dialog -->
    <Dialog v-model:open="showAclDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ t('acl.edit') }} ACL</DialogTitle>
        </DialogHeader>
        <div v-if="editingAcl" class="space-y-3 py-4">
          <div>
            <Label>{{ t('acl.scheme') }}</Label>
            <Select v-model="editingAcl.scheme">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem v-for="s in SCHEME_OPTIONS" :key="s" :value="s">{{ s }}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{{ t('acl.id') }}</Label>
            <Input v-model="editingAcl.id" />
          </div>
          <div>
            <Label>{{ t('acl.permission') }}</Label>
            <Select v-model="editingAcl.permission">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem v-for="p in PERMISSION_OPTIONS" :key="p" :value="p">{{ p }}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showAclDialog = false">{{ t('connection.cancel') }}</Button>
          <Button @click="saveAcl" :disabled="isSubmitting">{{ t('connection.save') }}</Button>
        </DialogFooter>
        <p v-if="errorMessage" class="text-sm text-red-500">{{ errorMessage }}</p>
      </DialogContent>
    </Dialog>
  </div>
</template>