<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Button } from '../../ui/button';
import { TabsContent } from '../../ui/tabs';
import type { ZkAclEntry } from '../../../types/znodeDetails';

defineProps<{
  acl: ZkAclEntry[];
}>();

const emit = defineEmits<{
  (e: 'add'): void;
  (e: 'delete', acl: ZkAclEntry): void;
  (e: 'edit', acl: ZkAclEntry): void;
}>();

const { t } = useI18n();
</script>

<template>
  <TabsContent
    value="ACL"
    class="flex-1 overflow-auto"
  >
    <div class="p-2">
      <Button
        size="sm"
        class="mb-2"
        @click="emit('add')"
      >
        {{ t('acl.add') }}
      </Button>
      <div class="space-y-2">
        <div
          v-for="(aclEntry, index) in acl"
          :key="`${aclEntry.scheme}-${aclEntry.id}-${index}`"
          class="flex items-center justify-between border rounded p-3"
        >
          <div class="text-sm space-y-1">
            <div><span class="font-medium">{{ t('acl.scheme') }}:</span> {{ aclEntry.scheme }}</div>
            <div><span class="font-medium">{{ t('acl.id') }}:</span> {{ aclEntry.id }}</div>
            <div><span class="font-medium">{{ t('acl.permission') }}:</span> {{ aclEntry.permission }}</div>
          </div>
          <div class="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              @click="emit('edit', aclEntry)"
            >
              {{ t('acl.edit') }}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              @click="emit('delete', aclEntry)"
            >
              {{ t('acl.delete') }}
            </Button>
          </div>
        </div>
        <p
          v-if="!acl.length"
          class="text-sm text-muted-foreground"
        >
          no acl data
        </p>
      </div>
    </div>
  </TabsContent>
</template>
