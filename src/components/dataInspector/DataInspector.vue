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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
const parser = ref('text');

</script>

<template>
  <div class="h-full flex flex-col">
    <div class="flex mb-2 bg-background p-2 rounded-sm box-border">
      <Input class="max-w-80 mr-10" />
      <Button class="mr-5">
        delete
      </Button>
      <Button>
        refresh
      </Button>
    </div>
    <Tabs
      default-value="Data"
      class="flex-1 bg-background p-2 rounded-sm box-border"
    >
      <TabsList class="w-full">
        <TabsTrigger value="Data">
          Data
        </TabsTrigger>
        <TabsTrigger value="ACL">
          ACL
        </TabsTrigger>
        <TabsTrigger value="Meta">
          Meta
        </TabsTrigger>
      </TabsList>
      <TabsContent
        value="Data"
        class="flex flex-col"
      >
        <div class="flex shrink-0 p-2 gap-2">
          <Button>
            Save
          </Button>
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
        </div>
        <div
          v-if="parser === 'text'"
          class="flex-1 min-h-0"
        >
          <TextViewer />
        </div>
        <div
          v-if="parser === 'binary'"
          class="flex-1 min-h-0"
        >
          <BinaryViwer />
        </div>
        <div
          v-if="parser === 'hex'"
          class="flex-1 min-h-0"
        >
          <HexViewer />
        </div>
        <div
          v-if="parser === 'json'"
          class="flex-1 min-h-0"
        >
          <JSONViewer />
        </div>
        <div
          v-if="parser === 'xml'"
          class="flex-1 min-h-0"
        >
          <XMLViewer />
        </div>
      </TabsContent>
      <TabsContent value="ACL">
        ACL
      </TabsContent>
      <TabsContent value="Meta">
        Meta
      </TabsContent>
    </Tabs>
  </div>
</template>