<script setup lang="ts">
import { ref, watch } from 'vue';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { useI18n } from 'vue-i18n';
import type { Connection } from '../../stores/connections';
import { Eye, EyeOff } from 'lucide-vue-next';

const { t } = useI18n();

const props = defineProps<{
  open: boolean;
  connection: Partial<Connection> | null;
  mode: 'add' | 'edit';
  saving?: boolean;
  testing?: boolean;
  errorMessage?: string;
}>();

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'save', connection: Omit<Connection, 'uuid'> & { uuid?: string }): void;
  (e: 'test', connection: Omit<Connection, 'uuid'> & { uuid?: string }): void;
}>();

const conn = ref<Partial<Connection>>({});
const showPassword = ref(false);

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      if (props.mode === 'edit' && props.connection) {
        conn.value = { ...props.connection };
      } else {
        conn.value = {
          name: '',
          url: '',
          username: '',
          password: '',
          use_ssh: false,
          ssh_host: '',
          ssh_port: 22,
          ssh_username: '',
          ssh_auth_method: 'password',
          ssh_password: '',
          ssh_key_path: '',
        };
      }
      showPassword.value = false;
    }
  },
);

const handleSave = () => {
  if (!conn.value.url) return;
  emit('save', conn.value as Omit<Connection, 'uuid'> & { uuid?: string });
};

const handleTest = () => {
  if (!conn.value.url) return;
  emit('test', conn.value as Omit<Connection, 'uuid'> & { uuid?: string });
};
</script>

<template>
  <Dialog
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <DialogContent class="max-w-[500px] p-0 overflow-hidden gap-0 bg-background/95 backdrop-blur-md rounded-xl">
      <DialogHeader class="p-5 pb-4 border-b border-border/50 bg-muted/20">
        <DialogTitle class="text-lg font-semibold tracking-tight">
          {{ mode === 'add' ? t('app.newConnection') : t('connection.edit') }}
        </DialogTitle>
      </DialogHeader>
      
      <Tabs
        default-value="general"
        class="w-full"
      >
        <div class="px-5 pt-3 pb-0">
          <TabsList class="grid grid-cols-2 w-[240px]">
            <TabsTrigger value="general">
              General
            </TabsTrigger>
            <TabsTrigger value="ssh">
              SSH Tunnel
            </TabsTrigger>
          </TabsList>
        </div>

        <div class="p-5 max-h-[60vh] overflow-y-auto">
          <TabsContent
            value="general"
            class="m-0 space-y-4 outline-none"
          >
            <div class="space-y-4">
              <div class="grid gap-2">
                <Label
                  for="name"
                  class="text-xs uppercase tracking-wider text-muted-foreground font-semibold"
                >
                  {{ t('connection.name') }}
                </Label>
                <Input
                  id="name"
                  v-model="conn.name"
                  placeholder="e.g. Production Cluster"
                />
              </div>
              <div class="grid gap-2">
                <Label
                  for="url"
                  class="text-xs uppercase tracking-wider text-muted-foreground font-semibold"
                >
                  {{ t('connection.url') }} <span class="text-destructive">*</span>
                </Label>
                <Input
                  id="url"
                  v-model="conn.url"
                  placeholder="localhost:2181"
                />
              </div>
              
              <div class="pt-2 grid grid-cols-2 gap-4">
                <div class="grid gap-2">
                  <Label
                    for="username"
                    class="text-xs uppercase tracking-wider text-muted-foreground font-semibold"
                  >
                    {{ t('connection.username') }}
                  </Label>
                  <Input
                    id="username"
                    v-model="conn.username"
                    placeholder="Optional"
                  />
                </div>
                <div class="grid gap-2">
                  <Label
                    for="password"
                    class="text-xs uppercase tracking-wider text-muted-foreground font-semibold"
                  >
                    {{ t('connection.password') }}
                  </Label>
                  <div class="relative">
                    <Input
                      id="password"
                      v-model="conn.password"
                      :type="showPassword ? 'text' : 'password'"
                      placeholder="Optional"
                    />
                    <Button
                      :aria-label="showPassword ? 'Hide password' : 'Show password'"
                      variant="ghost"
                      size="icon"
                      class="absolute right-1 top-1 h-7 w-7 text-muted-foreground"
                      @click="showPassword = !showPassword"
                    >
                      <component
                        :is="showPassword ? EyeOff : Eye"
                        class="h-4 w-4"
                      />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent
            value="ssh"
            class="m-0 space-y-5 outline-none"
          >
            <div class="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/20">
              <div class="space-y-0.5">
                <Label
                  for="use_ssh"
                  class="text-[13px] font-medium"
                >{{ t('connection.useSsh') }}</Label>
                <p class="text-xs text-muted-foreground">
                  Proxy your ZK connection through a secure shell.
                </p>
              </div>
              <input
                id="use_ssh"
                v-model="conn.use_ssh"
                type="checkbox"
                class="h-4 w-4 accent-primary rounded cursor-pointer"
              >
            </div>

            <div
              v-if="conn.use_ssh"
              class="space-y-4 animate-fade-in"
            >
              <div class="grid grid-cols-3 gap-4">
                <div class="col-span-2 grid gap-2">
                  <Label class="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{{ t('connection.sshHost') }}</Label>
                  <Input
                    v-model="conn.ssh_host"
                    placeholder="example.com"
                  />
                </div>
                <div class="grid gap-2">
                  <Label class="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{{ t('connection.sshPort') }}</Label>
                  <Input
                    v-model="conn.ssh_port"
                    type="number"
                  />
                </div>
              </div>
              
              <div class="grid gap-2">
                <Label class="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{{ t('connection.sshUsername') }}</Label>
                <Input
                  v-model="conn.ssh_username"
                  placeholder="root"
                />
              </div>
              
              <div class="grid gap-3 pt-2">
                <Label class="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{{ t('connection.sshAuthMethod') }}</Label>
                <div class="flex gap-4">
                  <label class="flex items-center gap-2 text-sm cursor-pointer hover:text-foreground text-muted-foreground transition-colors">
                    <input
                      v-model="conn.ssh_auth_method"
                      type="radio"
                      value="password"
                      class="accent-primary"
                    >
                    {{ t('connection.sshPassword') }}
                  </label>
                  <label class="flex items-center gap-2 text-sm cursor-pointer hover:text-foreground text-muted-foreground transition-colors">
                    <input
                      v-model="conn.ssh_auth_method"
                      type="radio"
                      value="key"
                      class="accent-primary"
                    >
                    {{ t('connection.sshKey') }}
                  </label>
                </div>
              </div>

              <div
                v-if="conn.ssh_auth_method === 'password'"
                class="grid gap-2 mt-2"
              >
                <Input
                  v-model="conn.ssh_password"
                  type="password"
                  placeholder="SSH Password"
                />
              </div>
              <div
                v-else
                class="grid gap-2 mt-2"
              >
                <Input
                  v-model="conn.ssh_key_path"
                  placeholder="Path to private key e.g. ~/.ssh/id_rsa"
                />
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>

      <DialogFooter class="p-5 pt-4 border-t border-border/50 bg-muted/20">
        <p
          v-if="errorMessage"
          class="mr-auto text-sm text-destructive"
        >
          {{ errorMessage }}
        </p>
        <Button
          variant="ghost"
          :disabled="saving || testing"
          @click="emit('update:open', false)"
        >
          {{ t('connection.cancel') }}
        </Button>
        <Button
          variant="outline"
          :disabled="!conn.url || saving || testing"
          class="min-w-[100px]"
          @click="handleTest"
        >
          {{ testing ? t('connection.testing') : t('connection.test') }}
        </Button>
        <Button
          :disabled="!conn.url || saving || testing"
          class="min-w-[100px]"
          @click="handleSave"
        >
          {{ t('connection.save') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
