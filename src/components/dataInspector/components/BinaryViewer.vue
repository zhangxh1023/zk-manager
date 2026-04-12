<script setup lang="ts">
import { Textarea } from '../../ui/textarea';

defineProps<{
  modelValue: string;
  readonly?: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
}>();
</script>

<template>
  <Textarea
    :model-value="modelValue"
    :readonly="readonly"
    class="h-full resize-none font-mono text-xs"
    placeholder="01001000 01100101 01101100 01101100 01101111"
    @update:model-value="emit('update:modelValue', String($event))"
  />
</template>
