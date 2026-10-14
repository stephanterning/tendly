import { PgBoss } from 'pg-boss';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { buildApp } from './app.js';
import { readConfig } from './config.js';
import * as schema from './db/schema.js';
import { AccountService } from './accounts/service.js';
import { MailService } from './accounts/mail.js';
const config = readConfig();
const pool = new pg.Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 5000, query_timeout: 5000 });
const db = drizzle(pool, { schema });
const service = new AccountService(db, config.PUBLIC_ORIGIN);
const boss = new PgBoss({ connectionString: config.DATABASE_URL });
boss.on('error', () => console.error('Account mail queue failed'));
await boss.start();
await boss.createQueue('account-mail');
const mail = new MailService(db, config.APP_ENCRYPTION_KEY, config.PUBLIC_ORIGIN, async (payload) => {
  await boss.send('account-mail', payload, { retryLimit: 3, retryDelay: 30, expireInSeconds: 60 });
});
const app = await buildApp({
  version: config.APP_VERSION, logLevel: config.LOG_LEVEL, accounts: { service, mail },
  closeDatabase: async () => { await boss.stop(); await pool.end(); },
  checkDatabase: async () => { await pool.query('SELECT 1'); },
});
pool.on('error', () => app.log.error('Database connection failed'));
const cleanup = setInterval(() => { void service.cleanup().catch(() => app.log.error('Account cleanup failed')); }, 3600_000);
cleanup.unref();
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => { clearInterval(cleanup); void app.close(); });
}
try { await app.listen({ host: config.HOST, port: config.PORT }); }
catch { app.log.fatal('API startup failed'); await app.close(); process.exitCode = 1; }
