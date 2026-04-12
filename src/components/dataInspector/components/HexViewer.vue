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
    class="h-full resize-none font-mono text-xs uppercase"
    placeholder="48 65 6C 6C 6F"
    @update:model-value="emit('update:modelValue', String($event))"
  />
</template>
