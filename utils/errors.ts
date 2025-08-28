export interface AppError {
  message: string;
  name?: string;
  stack?: string;
  code?: string | number;
  cause?: unknown;
}

export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

export function toAppError(error: unknown): AppError {
  if (isError(error)) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
      cause: error.cause,
    };
  }
  
  if (typeof error === 'string') {
    return { message: error };
  }
  
  if (error && typeof error === 'object' && 'message' in error) {
    return {
      message: String((error as any).message),
      name: 'name' in error ? String((error as any).name) : undefined,
      stack: 'stack' in error ? String((error as any).stack) : undefined,
    };
  }
  
  return { message: 'Unknown error occurred' };
}