<script setup lang="ts">
import { Codemirror } from 'vue-codemirror';
import { json } from '@codemirror/lang-json';

defineProps<{
  modelValue: string;
}>();

defineEmits<{
  (event: 'update:modelValue', value: string): void;
}>();

const extensions = [json()]
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
