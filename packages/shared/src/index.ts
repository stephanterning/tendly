import { z } from 'zod';
export const healthSchema = z.object({ status: z.enum(['ok', 'unavailable']) });
export const versionSchema = z.object({ name: z.literal('Tendly'), version: z.string() });
export * from './accounts.js';
