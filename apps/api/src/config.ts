import { z } from 'zod';
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url().refine((value) => URL.canParse(value) && ['postgres:', 'postgresql:'].includes(new URL(value).protocol)),
  PUBLIC_ORIGIN: z.url().refine((value) => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash;
  }, 'Expected an origin without credentials, path, query, or fragment'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  APP_VERSION: z.string().default('0.0.0-dev'),
});
export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const result = schema.safeParse(env);
  if (!result.success) {
    // Values may contain credentials. Report field names, never the original input.
    throw new Error(`Invalid configuration: ${[...new Set(result.error.issues.map((issue) => issue.path.join('.')))].join(', ')}`);
  }
  const config = result.data;
  const origin = new URL(config.PUBLIC_ORIGIN);
  if (origin.protocol !== 'https:' && !(config.NODE_ENV !== 'production' && origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))) {
    throw new Error('PUBLIC_ORIGIN must use HTTPS (HTTP localhost is development-only)');
  }
  return config;
}
