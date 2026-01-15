<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { CirclePlus, Settings, ClipboardClock } from 'lucide-vue-next';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ref } from 'vue';
import { getDb } from '@/db/db';
import { v4 as uuidv4 } from 'uuid';

const urlRef = ref('');
const nameRef = ref('');

const saveConnection = async () => {
  if (!urlRef.value || !nameRef.value) {
    return;
  }
  const db = await getDb();
  const result = await db.execute(
    'INSERT into connections (uuid, url, name) VALUES ($1, $2, $3)',
    [uuidv4(), urlRef.value, nameRef.value]
  );
  console.log(result);
  urlRef.value = '';
  nameRef.value = '';
}

</script>

<template>
  <div>

    <Dialog>
      <DialogTrigger as-child>
        <Button variant="ghost" size="sm" class="cursor-pointer">
          <CirclePlus />
          new connection
        </Button>
      </DialogTrigger>
      <DialogContent class="sm:max-w-106.25">
        <DialogHeader>
          <DialogTitle>new connection</DialogTitle>
          <DialogDescription>

          </DialogDescription>
        </DialogHeader>
        <div class="grid gap-4">
          <div class="grid gap-3">
            <Label for="url">url</Label>
            <Input id="url" v-model="urlRef" />
          </div>
          <div class="grid gap-3">
            <Label for="name">name</Label>
            <Input id="name" v-model="nameRef" />
          </div>
        </div>
        <DialogFooter>
          <DialogClose as-child>
            <Button variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button @click="saveConnection">
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Button variant="ghost" size="sm" class="cursor-pointer">
      <Settings />
      Settings
    </Button>

    <Button variant="ghost" size="sm" class="cursor-pointer">
      <ClipboardClock />
      logs
    </Button>
  </div>
</template>