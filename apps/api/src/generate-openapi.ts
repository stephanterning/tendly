import { writeFile } from 'node:fs/promises';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { buildApp } from './app.js';
import * as schema from './db/schema.js';
import { AccountService } from './accounts/service.js';
import { MailService } from './accounts/mail.js';
// Lazy pool: contract generation registers routes without connecting to a database.
const pool = new pg.Pool();
const db = drizzle(pool, { schema });
const app = await buildApp({ checkDatabase: async () => {}, accounts: {
  service: new AccountService(db, 'https://example.com'),
  mail: new MailService(db, '0'.repeat(64), 'https://example.com'),
} });
await writeFile(new URL('../../../packages/shared/openapi.json', import.meta.url), JSON.stringify(app.swagger(), null, 2) + '\n');
await app.close();
await pool.end();
