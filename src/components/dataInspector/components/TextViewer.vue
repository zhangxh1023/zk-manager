<script setup lang="ts">
import { Textarea } from '../../ui/textarea';

defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
}>();
</script>

<template>
  <Textarea
    :model-value="modelValue"
    class="h-full resize-none font-mono text-xs"
    @update:model-value="emit('update:modelValue', String($event))"
  />
</template>
