import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useDataStore = defineStore('data', () => {
  const data = ref<number[]>([]);

  function setData(newData: number[]) {
    data.value = newData;
  }

  return { data, setData }
})
