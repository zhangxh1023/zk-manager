import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useDataStore = defineStore('data', () => {
  const data = ref('');

  function setData(newData: string) {
    data.value = newData;
  }

  return { data, setData }
})
