import createClient from 'openapi-fetch';
import type { paths } from './generated/api.js';
export function createApiClient(baseUrl = '') {
  return createClient<paths>({ baseUrl, credentials: 'same-origin' });
}
