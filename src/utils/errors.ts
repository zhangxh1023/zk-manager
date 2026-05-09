export interface AppError {
  code?: string;
  message?: string;
  detail?: string | null;
}

export const isAppError = (error: unknown): error is AppError =>
  typeof error === 'object' && error !== null && 'message' in error;

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (isAppError(error) && error.message) return error.message;
  return String(error);
};

export const getErrorCode = (error: unknown): string | undefined =>
  isAppError(error) ? error.code : undefined;
