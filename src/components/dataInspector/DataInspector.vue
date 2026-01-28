<script setup lang="ts">
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import { ref } from 'vue';
import TextViewer from './components/TextViewer.vue';
import BinaryViwer from './components/BinaryViewer.vue';
import HexViewer from './components/HexViewer.vue';
import JSONViewer from './components/JSONViewer.vue';
import XMLViewer from './components/XMLViewer.vue';
const parser = ref('text');

</script>

<template>
  <Select v-model="parser">
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
  <div v-if="parser === 'text'">
    <TextViewer />
  </div>
  <div v-if="parser === 'binary'">
    <BinaryViwer />
  </div>
  <div v-if="parser === 'hex'">
    <HexViewer />
  </div>
  <div v-if="parser === 'json'">
    <JSONViewer />
  </div>
  <div v-if="parser === 'xml'">
    <XMLViewer />
  </div>
</template>