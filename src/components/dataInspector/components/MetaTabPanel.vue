<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { TabsContent } from '../../ui/tabs';
import type { StatRow } from '../types';

defineProps<{
  rows: StatRow[];
}>();

const { t } = useI18n();
</script>

<template>
  <TabsContent
    value="Meta"
    class="flex-1 overflow-auto"
  >
    <div class="space-y-2 p-2 text-sm">
      <div
        v-for="[label, value] in rows"
        :key="label"
        class="flex justify-between gap-4 border rounded px-3 py-2"
      >
        <span class="font-medium">{{ t(`meta.${label}`) || label }}</span>
        <span class="text-right break-all">{{ value }}</span>
      </div>
    </div>
  </TabsContent>
</template>
