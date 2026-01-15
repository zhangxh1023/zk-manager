<script setup lang="ts">
import { useDataStore } from '@/stores/data';
import { storeToRefs } from 'pinia';


const dataStore = useDataStore();
const { data } = storeToRefs(dataStore);

</script>

<template>
  <div class="flex h-full items-center justify-center">{{ data }}</div>
</template>