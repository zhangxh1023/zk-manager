export interface AppError {
  code?: string;
  message?: string;
  detail?: string | null;
}

export const isAppError = (error: unknown): error is AppError =>
  typeof error === 'object' && error !== null && 'message' in error;

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (isAppError(error)) {
    if (error.detail) {
      if (!error.message || error.detail.startsWith(error.message)) {
        return error.detail;
      }
      return `${error.message}: ${error.detail}`;
    }
    if (error.message) return error.message;
  }
  return String(error);
};

export const getErrorCode = (error: unknown): string | undefined =>
  isAppError(error) ? error.code : undefined;

export const isSshHostKeyUntrustedError = (error: unknown): boolean => {
  if (getErrorCode(error) === 'SSH_HOST_KEY_UNTRUSTED') return true;
  return getErrorMessage(error).includes('SSH host key is not trusted');
};
