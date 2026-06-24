<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '../../ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { TabsContent } from '../../ui/tabs';
import type { SerializationFormat } from '../../../utils/serializer';
import type { FormatOption } from '../types';
import BinaryViewer from './BinaryViewer.vue';
import HexViewer from './HexViewer.vue';
import TextViewer from './TextViewer.vue';

const JSONViewer = defineAsyncComponent(() => import('./JSONViewer.vue'));
const XMLViewer = defineAsyncComponent(() => import('./XMLViewer.vue'));

const props = defineProps<{
  dataFormat: SerializationFormat;
  editValue: string;
  errorMessage: string;
  formatOptions: FormatOption[];
  isSubmitting: boolean;
}>();

const emit = defineEmits<{
  (e: 'format'): void;
  (e: 'save'): void;
  (e: 'update:dataFormat', value: SerializationFormat): void;
  (e: 'update:editValue', value: string): void;
}>();

const { t } = useI18n();

const dataFormatModel = computed({
  get: () => props.dataFormat,
  set: value => emit('update:dataFormat', value),
});

const editValueModel = computed({
  get: () => props.editValue,
  set: value => emit('update:editValue', value),
});
</script>

<template>
  <TabsContent
    value="Data"
    class="flex flex-col flex-1 min-h-0 bg-background outline-none m-0"
  >
    <div class="flex items-center gap-2 p-2 px-4 shrink-0 bg-sidebar-accent/5 border-b border-sidebar-border/50">
      <Button
        size="sm"
        :disabled="isSubmitting"
        @click="emit('save')"
      >
        {{ t('tabs.save') }}
      </Button>
      <Select v-model="dataFormatModel">
        <SelectTrigger class="w-32">
          <SelectValue placeholder="Format" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem
              v-for="opt in formatOptions"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      <Button
        v-if="dataFormat === 'json' || dataFormat === 'xml'"
        size="sm"
        variant="outline"
        :disabled="isSubmitting"
        @click="emit('format')"
      >
        {{ t('tabs.format') }}
      </Button>
    </div>
    <div class="flex-1 min-h-0 p-2 overflow-auto">
      <TextViewer
        v-if="dataFormat === 'text'"
        v-model="editValueModel"
      />
      <JSONViewer
        v-else-if="dataFormat === 'json'"
        v-model="editValueModel"
      />
      <XMLViewer
        v-else-if="dataFormat === 'xml'"
        v-model="editValueModel"
      />
      <HexViewer
        v-else-if="dataFormat === 'hex'"
        v-model="editValueModel"
      />
      <BinaryViewer
        v-else-if="dataFormat === 'binary'"
        v-model="editValueModel"
      />
    </div>
    <p
      v-if="errorMessage"
      class="px-2 text-sm text-red-500 shrink-0"
    >
      {{ errorMessage }}
    </p>
  </TabsContent>
</template>
