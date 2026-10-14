import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';

export async function migrateDatabase(connectionString: string) {
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10000 });
  await client.connect();
  try {
    // Keep the lock on the same session as migration execution. Other deploys wait;
    // a crash releases the lock automatically, without a stale application flag.
    await client.query("SET lock_timeout = '60s'");
    await client.query('SELECT pg_advisory_lock(1952804452, 1)');
    try {
      await migrate(drizzle(client), { migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)) });
    } finally {
      await client.query('SELECT pg_advisory_unlock(1952804452, 1)');
    }
  } finally { await client.end(); }
}
