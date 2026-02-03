<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { ref, watch } from 'vue';
import { useZNodeTabsStore } from '../../../stores/zNodeTabs';
import { Textarea } from '../../ui/textarea';

const dataStore = useZNodeTabsStore();
const { data } = storeToRefs(dataStore);
const text = ref('');
watch(data, (value: number[], _: number[] | undefined) => {
  console.log(value);
  if (!value || value.length === 0) {
    text.value = '';
    return;
  }
  const uint8Array = new Uint8Array(value);
  const decoder = new TextDecoder('utf-8');
  text.value = decoder.decode(uint8Array);

}, { immediate: true })

</script>

<template>
  <Textarea
    :model-value="text"
    class="resize-none h-full"
  />
</template>