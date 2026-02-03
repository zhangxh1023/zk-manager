<script setup lang="ts">
import { ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useZNodeTabsStore } from '../../../stores/zNodeTabs';
import { Textarea } from '../../ui/textarea';

const dataStore = useZNodeTabsStore();
const { data } = storeToRefs(dataStore);
const text = ref('');
watch(data, (value: number[], _: number[] | undefined) => {
  if (!value || value.length === 0) {
    text.value = '';
    return;
  }
  text.value = Array.from(value)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}, { immediate: true })

</script>

<template>
  <Textarea
    :model-value="text"
    class="resize-none h-full"
  />
</template>