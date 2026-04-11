<script setup lang="ts">
import { Codemirror } from 'vue-codemirror';
import { xml } from '@codemirror/lang-xml';

defineProps<{
  modelValue: string;
}>();

defineEmits<{
  (event: 'update:modelValue', value: string): void;
}>();

const extensions = [xml()]
</script>

<template>
  <Codemirror
    :model-value="modelValue"
    :style="{ height: '400px' }"
    :autofocus="true"
    :indent-with-tab="true"
    :tab-size="2"
    :extensions="extensions"
    @update:model-value="$emit('update:modelValue', $event)"
  />
</template>
