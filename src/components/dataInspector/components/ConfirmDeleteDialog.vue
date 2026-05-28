<script setup lang="ts">
import { computed } from 'vue';
import { Button } from '../../ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';

const props = withDefaults(defineProps<{
  cancelText: string;
  confirmText: string;
  contentClass?: string;
  isSubmitting: boolean;
  message: string;
  open: boolean;
  small?: boolean;
  title: string;
}>(), {
  contentClass: '',
  small: false,
});

const emit = defineEmits<{
  (e: 'confirm'): void;
  (e: 'update:open', value: boolean): void;
}>();

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
});
</script>

<template>
  <Dialog v-model:open="openModel">
    <DialogContent :class="contentClass">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
      </DialogHeader>
      <div class="py-4">
        <p class="text-sm text-muted-foreground">
          {{ message }}
        </p>
      </div>
      <DialogFooter>
        <Button
          variant="outline"
          :size="small ? 'sm' : 'default'"
          @click="openModel = false"
        >
          {{ cancelText }}
        </Button>
        <Button
          variant="destructive"
          :size="small ? 'sm' : 'default'"
          :disabled="isSubmitting"
          @click="emit('confirm')"
        >
          {{ confirmText }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
