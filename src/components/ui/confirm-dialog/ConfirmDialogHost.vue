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
import { useConfirmDialogState } from '../../../composables/useConfirmDialog';

const { t } = useI18n();
const { currentConfirm, resolveConfirm } = useConfirmDialogState();

const open = computed({
  get: () => Boolean(currentConfirm.value),
  set: (value: boolean) => {
    if (!value) {
      resolveConfirm(false);
    }
  },
});

const title = computed(() => currentConfirm.value?.title || t('confirm.title'));
const message = computed(() => currentConfirm.value?.message || '');
const cancelText = computed(() => currentConfirm.value?.cancelText || t('confirm.cancel'));
const confirmText = computed(() => currentConfirm.value?.confirmText || t('confirm.confirm'));
const confirmVariant = computed(() =>
  currentConfirm.value?.variant === 'destructive' ? 'destructive' : 'default',
);
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
      </DialogHeader>
      <p class="py-4 text-sm text-muted-foreground whitespace-pre-wrap">
        {{ message }}
      </p>
      <DialogFooter>
        <Button
          variant="outline"
          @click="resolveConfirm(false)"
        >
          {{ cancelText }}
        </Button>
        <Button
          :variant="confirmVariant"
          @click="resolveConfirm(true)"
        >
          {{ confirmText }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
