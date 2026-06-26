<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '../../ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import type { ZkAclEntry } from '../../../types/znodeDetails';

const props = defineProps<{
  allPermissionsSelected: boolean;
  editingAcl: ZkAclEntry | null;
  isSubmitting: boolean;
  open: boolean;
  permissionOptions: string[];
  schemeHint: string;
  schemeOptions: string[];
  selectedPermissions: string[];
}>();

const emit = defineEmits<{
  (e: 'save'): void;
  (e: 'toggle-all-permissions', checked: boolean): void;
  (e: 'toggle-permission', permission: string, checked: boolean): void;
  (e: 'update-acl-field', field: keyof ZkAclEntry, value: string): void;
  (e: 'update:open', value: boolean): void;
}>();

const { t } = useI18n();

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
});

const inputChecked = (event: Event) => (event.target as HTMLInputElement).checked;
</script>

<template>
  <Dialog v-model:open="openModel">
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
          <Select
            :model-value="editingAcl.scheme"
            @update:model-value="value => emit('update-acl-field', 'scheme', String(value))"
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem
                  v-for="s in schemeOptions"
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
          <Input
            :model-value="editingAcl.id"
            @update:model-value="value => emit('update-acl-field', 'id', String(value))"
          />
          <p
            v-if="schemeHint"
            class="text-xs text-muted-foreground mt-1"
          >
            {{ schemeHint }}
          </p>
        </div>
        <div>
          <Label class="text-xs uppercase tracking-wider font-semibold text-muted-foreground">{{ t('acl.permission') }}</Label>
          <div class="mt-2 grid grid-cols-2 gap-2 rounded-md border p-3">
            <label class="col-span-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                class="accent-primary"
                :checked="allPermissionsSelected"
                @change="emit('toggle-all-permissions', inputChecked($event))"
              >
              ALL
            </label>
            <label
              v-for="p in permissionOptions"
              :key="p"
              class="flex items-center gap-2 text-sm"
            >
              <input
                type="checkbox"
                class="accent-primary"
                :checked="selectedPermissions.includes(p)"
                @change="emit('toggle-permission', p, inputChecked($event))"
              >
              {{ p }}
            </label>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button
          variant="outline"
          @click="openModel = false"
        >
          {{ t('connection.cancel') }}
        </Button>
        <Button
          :disabled="isSubmitting"
          @click="emit('save')"
        >
          {{ t('connection.save') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
