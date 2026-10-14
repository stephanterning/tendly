import { z } from 'zod';
export const emailSchema = z.email().max(254).toLowerCase();
export const nameSchema = z.string().trim().min(1).max(100);
export const timezoneSchema = z.string().max(100).refine((value) => {
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
}, 'Invalid timezone');
export const roleSchema = z.enum(['admin', 'member']);
export const smtpSchema = z.object({
  host: z.string().trim().min(1).max(253),
  port: z.number().int().min(1).max(65535),
  security: z.enum(['tls', 'starttls']),
  username: z.string().max(254),
  password: z.string().max(1024).optional(),
  sender: emailSchema,
});
export const registrationInput = z.discriminatedUnion('flow', [
  z.object({ flow: z.literal('bootstrap'), token: z.string().min(20).max(128), language: z.enum(['en', 'sv']).optional(), name: nameSchema, email: emailSchema, householdName: nameSchema, timezone: timezoneSchema }),
  z.object({ flow: z.literal('invite'), token: z.string().min(20).max(128), name: nameSchema, language: z.enum(['en', 'sv']).optional() }),
  z.object({ flow: z.literal('recovery'), token: z.string().min(20).max(128) }),
  z.object({ flow: z.literal('add') }),
]);
export const verificationInput = z.object({ ceremonyId: z.uuid(), response: z.record(z.string(), z.unknown()), name: nameSchema.default('Passkey') });
export const accountSchema = z.object({
  id: z.uuid(), name: z.string(), email: z.string(), emailVerified: z.boolean(), deploymentAdmin: z.boolean(), language: z.enum(['en', 'sv']), theme: z.enum(['system', 'light', 'dark']),
  households: z.array(z.object({ id: z.uuid(), name: z.string(), timezone: z.string(), role: roleSchema })),
});
export const sessionSchema = z.object({ account: accountSchema.nullable() });
export const okSchema = z.object({ ok: z.literal(true) });
export const errorSchema = z.object({ error: z.string() });
export type RegistrationInput = z.infer<typeof registrationInput>;
export type SmtpConfig = z.infer<typeof smtpSchema>;
export type Account = z.infer<typeof accountSchema>;
