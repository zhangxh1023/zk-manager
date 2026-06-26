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
import { Textarea } from '../../ui/textarea';

const props = defineProps<{
  createMissingParents: boolean;
  isSubmitting: boolean;
  nodeData: string;
  nodeName: string;
  open: boolean;
}>();

const emit = defineEmits<{
  (e: 'submit'): void;
  (e: 'update:createMissingParents', value: boolean): void;
  (e: 'update:nodeData', value: string): void;
  (e: 'update:nodeName', value: string): void;
  (e: 'update:open', value: boolean): void;
}>();

const { t } = useI18n();

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
});

const nodeNameModel = computed({
  get: () => props.nodeName,
  set: value => emit('update:nodeName', value),
});

const nodeDataModel = computed({
  get: () => props.nodeData,
  set: value => emit('update:nodeData', value),
});

const createMissingParentsModel = computed({
  get: () => props.createMissingParents,
  set: value => emit('update:createMissingParents', value),
});
</script>

<template>
  <Dialog v-model:open="openModel">
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
            v-model="nodeNameModel"
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
            v-model="nodeDataModel"
            :placeholder="t('createNode.placeholder.data')"
            class="font-mono text-xs"
          />
        </div>
        <label class="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            v-model="createMissingParentsModel"
            type="checkbox"
            class="size-4 rounded border-input"
          >
          <span>{{ t('createNode.createMissingParents') }}</span>
        </label>
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
          @click="emit('submit')"
        >
          {{ t('connection.save') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
