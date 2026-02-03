<script setup lang="ts">
import { ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { Codemirror } from 'vue-codemirror';
import { json } from '@codemirror/lang-json';
import { useZNodeTabsStore } from '../../../stores/zNodeTabs';

const dataStore = useZNodeTabsStore();
const { data } = storeToRefs(dataStore);
const jsonObject = ref('');
watch(data, (value: number[]) => {
  if (!value || value.length === 0) {
    jsonObject.value = '';
    return;
  }
  const uint8Array = new Uint8Array(value);
  const decoder = new TextDecoder('utf-8');
  const jsonStr = decoder.decode(uint8Array);
  try {
    jsonObject.value = JSON.stringify(JSON.parse(jsonStr), null, 2);
  } catch {
    jsonObject.value = jsonStr;
  }
}, { immediate: true })

const extensions = [json()]
</script>

<template>
  <Codemirror
    v-model="jsonObject"
    :style="{ height: '400px' }"
    :autofocus="true"
    :indent-with-tab="true"
    :tab-size="2"
    :extensions="extensions"
  />
</template>