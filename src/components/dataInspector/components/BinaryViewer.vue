<script setup lang="ts">
import { useZNodeTabsStore } from '../../../stores/zNodeTabs';
import { ref, watch } from 'vue';
import { Textarea } from '../../ui/textarea';
import { storeToRefs } from 'pinia';

const dataStore = useZNodeTabsStore();
const { data } = storeToRefs(dataStore);
const text = ref('');
watch(data, (value: number[], _: number[] | undefined) => {
  if (!value || value.length === 0) {
    text.value = '';
    return;
  }
  text.value = Array.from(value)
    .map(byte => byte.toString(2).padStart(8, '0'))
    .join('');
}, { immediate: true })

</script>

<template>
  <Textarea
    :model-value="text"
    class="resize-none h-full"
  />
</template>