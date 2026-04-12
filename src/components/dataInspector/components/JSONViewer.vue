<script setup lang="ts">
import { Codemirror } from 'vue-codemirror';
import { json } from '@codemirror/lang-json';

defineProps<{
  modelValue: string;
  readonly?: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
}>();

const extensions = [
  json(),
];

const handleChange = (value: string) => {
  emit('update:modelValue', value);
};
</script>

<template>
  <div class="h-full overflow-hidden">
    <Codemirror
      :model-value="modelValue"
      :extensions="extensions"
      :readonly="readonly"
      :style="{ height: '100%' }"
      @update:model-value="handleChange"
    />
  </div>
</template>
