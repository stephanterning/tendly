import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { PgBoss } from 'pg-boss';
import { z } from 'zod';
import * as schema from '../db/schema.js';
import { decryptSecret, digest } from './crypto.js';
import { MailService } from './mail.js';
import type { readConfig } from '../config.js';
export async function registerMailJobs(boss: PgBoss, config: ReturnType<typeof readConfig>) {
  const pool = new pg.Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 5000 });
  pool.on('error', () => console.error('Mail worker database connection failed'));
  const db = drizzle(pool, { schema });
  const mail = new MailService(db, config.APP_ENCRYPTION_KEY, config.PUBLIC_ORIGIN);
  await boss.createQueue('account-mail');
  await boss.work<{ encrypted: string }>('account-mail', async (jobs) => {
    for (const job of jobs) {
      const payload = z.object({ email: z.email(), token: z.string() }).parse(JSON.parse(decryptSecret(job.data.encrypted, config.APP_ENCRYPTION_KEY)));
      const [token] = await db.select().from(schema.tokens).where(and(eq(schema.tokens.id, digest(payload.token)), eq(schema.tokens.purpose, 'recovery'), isNull(schema.tokens.usedAt), gt(schema.tokens.expiresAt, new Date())));
      if (token?.email === payload.email) await mail.sendToken(payload.email, payload.token, 'recovery');
    }
  });
  return async () => { await pool.end(); };
}
