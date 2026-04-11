<script setup lang="ts">
import { Textarea } from '../../ui/textarea';
defineProps<{
  modelValue: string;
}>();

defineEmits<{
  (event: 'update:modelValue', value: string): void;
}>();
</script>

<template>
  <Textarea
    :model-value="modelValue"
    class="resize-none h-full"
    @update:model-value="$emit('update:modelValue', String($event))"
  />
</template>
