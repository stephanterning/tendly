import nodemailer from 'nodemailer';
import { eq } from 'drizzle-orm';
import { smtpSchema, type SmtpConfig } from '@tendly/shared';
import type { Database } from './database.js';
import { smtpSettings } from './schema.js';
import { decryptSecret, encryptSecret } from './crypto.js';
import { AccountError } from './errors.js';

export class MailService {
  constructor(private db: Database, private key: string, private origin: string,
    private enqueue?: (payload: { encrypted: string }) => Promise<void>) {}
  async queueRecovery(email: string, token: string) {
    if (!this.enqueue) throw new AccountError('email_delivery_failed', 503);
    await this.enqueue({ encrypted: encryptSecret(JSON.stringify({ email, token }), this.key) });
  }
  async config(): Promise<SmtpConfig | null> {
    const [row] = await this.db.select().from(smtpSettings).where(eq(smtpSettings.id, 1));
    return row ? smtpSchema.parse(JSON.parse(decryptSecret(row.encrypted, this.key))) : null;
  }
  async publicConfig() {
    const config = await this.config();
    if (!config) return null;
    const { password, ...publicFields } = config;
    return { ...publicFields, hasPassword: !!password };
  }
  async save(input: SmtpConfig) {
    const old = await this.config();
    const config = { ...input, password: input.password ?? old?.password ?? '' };
    const encrypted = encryptSecret(JSON.stringify(config), this.key);
    await this.db.insert(smtpSettings).values({ id: 1, encrypted })
      .onConflictDoUpdate({ target: smtpSettings.id, set: { encrypted } });
  }
  async send(to: string, subject: string, text: string) {
    const config = await this.config();
    if (!config) throw new AccountError('smtp_not_configured', 503);
    const transport = nodemailer.createTransport({
      host: config.host, port: config.port, secure: config.security === 'tls',
      requireTLS: config.security === 'starttls',
      ...(config.username ? { auth: { user: config.username, pass: config.password ?? '' } } : {}),
      connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
      disableFileAccess: true, disableUrlAccess: true,
    });
    try { await transport.sendMail({ from: config.sender, to, subject, text }); }
    catch { throw new AccountError('email_delivery_failed', 503); }
    finally { transport.close(); }
  }
  async sendToken(email: string, token: string, purpose: 'invite' | 'recovery' | 'verify_email') {
    // Fragments never reach proxy access logs or Referer headers. The client clears
    // the fragment immediately and submits the token in a same-origin POST body.
    const url = `${this.origin}/#${purpose}=${encodeURIComponent(token)}`;
    const label = { invite: 'Join your household', recovery: 'Recover your account', verify_email: 'Verify your email' }[purpose];
    await this.send(email, `${label} · Tendly`, `${label}\n\n${url}\n\nThis link works once and expires. If you did not expect it, ignore this email.\n\nTendly`);
  }
}
