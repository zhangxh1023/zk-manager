import { ref } from 'vue';

export type ConfirmDialogOptions = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive';
};

type ConfirmDialogState = ConfirmDialogOptions & {
  resolve: (confirmed: boolean) => void;
};

const currentConfirm = ref<ConfirmDialogState | null>(null);

export const confirmDialog = (options: string | ConfirmDialogOptions): Promise<boolean> => {
  const normalizedOptions = typeof options === 'string' ? { message: options } : options;
  const activeConfirm = currentConfirm.value;
  if (activeConfirm) {
    activeConfirm.resolve(false);
  }

  return new Promise<boolean>((resolve) => {
    currentConfirm.value = {
      ...normalizedOptions,
      resolve,
    };
  });
};

export const useConfirmDialogState = () => {
  const resolveConfirm = (confirmed: boolean) => {
    const activeConfirm = currentConfirm.value;
    if (!activeConfirm) return;
    currentConfirm.value = null;
    activeConfirm.resolve(confirmed);
  };

  return {
    currentConfirm,
    resolveConfirm,
  };
};
