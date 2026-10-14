import { createApiClient } from '@tendly/shared/client';
export const api = createApiClient();
export async function result<T>(request: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  let response;
  try { response = await request; } catch { throw new Error('network_error'); }
  if (!response.response.ok) {
    const error = response.error;
    throw new Error(error && typeof error === 'object' && 'error' in error ? String(error.error) : 'operation_failed');
  }
  return response.data as T;
}
