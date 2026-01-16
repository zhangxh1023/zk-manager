<script setup lang="ts">
import { useDataStore } from '@/stores/data';
import { storeToRefs } from 'pinia';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ref, watch } from 'vue';
import { AcceptableValue } from 'reka-ui';

const dataStore = useDataStore();
const { data } = storeToRefs(dataStore);

const decodeUtf8 = (bytes: number[]) => {
  if (!bytes || bytes.length === 0) return '';
  const uint8Array = new Uint8Array(bytes);
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(uint8Array);
}
const decodeHex = (bytes: number[]) => {
  if (!bytes || bytes.length === 0) return '';
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

const toBinaryString = (bytes: Uint8Array | number[]): string => {
  return Array.from(bytes)
    .map(byte => byte.toString(2).padStart(8, '0'))
    .join('');
}

const parser = ref('text');
const decodeBinary = ref('');
watch(data, (value: number[], _: number[] | undefined) => {
  console.log('value changed', value);
  if (parser.value === 'text') {
    decodeBinary.value = decodeUtf8(value);
  } else if (parser.value === 'hex') {
    decodeBinary.value = decodeHex(value);
  } else if (parser.value === 'binary') {
    decodeBinary.value = toBinaryString(value);
  } else {
    decodeBinary.value = value.toString();
  }
}, { immediate: true })

const changeParser = (v: AcceptableValue) => {
  if (v === 'text') {
    decodeBinary.value = decodeUtf8(data.value);
  } else if (v === 'hex') {
    decodeBinary.value = decodeHex(data.value);
  } else if (v === 'binary') {
    decodeBinary.value = toBinaryString(data.value);
  } else {
    decodeBinary.value = data.value.toString();
  }
};

</script>

<template>
  <Select v-model="parser" @update:model-value="changeParser">
    <SelectTrigger class="w-45">
      <SelectValue placeholder="Select a fruit" />
    </SelectTrigger>
    <SelectContent>
      <SelectGroup>
        <SelectItem value="text">
          text
        </SelectItem>
        <SelectItem value="binary">
          binary
        </SelectItem>
        <SelectItem value="hex">
          hex
        </SelectItem>
        <SelectItem value="json">
          json
        </SelectItem>
        <SelectItem value="xml">
          xml
        </SelectItem>
      </SelectGroup>
    </SelectContent>
  </Select>
  <div class="flex h-full items-center justify-center">{{ decodeBinary }}</div>
</template>