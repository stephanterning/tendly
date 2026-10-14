import { z } from 'zod';
export const healthSchema = z.object({ status: z.enum(['ok', 'unavailable']) });
export const versionSchema = z.object({ name: z.literal('Tendly'), version: z.string() });
export * from './accounts.js';
export * from './tasks.js';
export * from './planning.js';
export * from './lifecycle.js';
export * from './content.js';
