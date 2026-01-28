<script setup lang="ts">
import { ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { Codemirror } from 'vue-codemirror';
import { xml } from '@codemirror/lang-xml';
import xmlFormat from 'xml-formatter';
import { useDataStore } from '../../../stores/data';

const dataStore = useDataStore();
const { data } = storeToRefs(dataStore);
const formattedStr = ref('');
watch(data, (value: number[]) => {
  if (!value || value.length === 0) {
    formattedStr.value = '';
    return;
  }
  const uint8Array = new Uint8Array(value);
  const decoder = new TextDecoder('utf-8');
  const xmlStr = decoder.decode(uint8Array);
  try {
    formattedStr.value = xmlFormat(xmlStr, {
      indentation: '  ',
    });
  } catch {
    formattedStr.value = xmlStr;
  }
}, { immediate: true })

const extensions = [xml()]
</script>

<template>
  <Codemirror
    v-model="formattedStr"
    :style="{ height: '400px' }"
    :autofocus="true"
    :indent-with-tab="true"
    :tab-size="2"
    :extensions="extensions"
  />
</template>