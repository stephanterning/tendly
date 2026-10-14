import { expect, it } from 'vitest';
import pg from 'pg';
import { migrateDatabase } from './migrate.js';

it('serializes concurrent migrators and preserves data across repeated migrations', async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL must name a dedicated PostgreSQL test database');
  await Promise.all([migrateDatabase(url), migrateDatabase(url)]);
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  let id: string | undefined;
  try {
    const inserted = await client.query<{ id: string }>('INSERT INTO installation DEFAULT VALUES RETURNING id');
    id = inserted.rows[0]?.id;
    expect(id).toBeDefined();
    const migrationCount = (await client.query('SELECT * FROM drizzle.__drizzle_migrations')).rowCount;
    expect(migrationCount).toBeGreaterThan(0);
    await migrateDatabase(url);
    expect((await client.query('SELECT id FROM installation WHERE id = $1', [id])).rowCount).toBe(1);
    expect((await client.query('SELECT * FROM drizzle.__drizzle_migrations')).rowCount).toBe(migrationCount);
  } finally {
    if (id) await client.query('DELETE FROM installation WHERE id = $1', [id]);
    await client.end();
  }
}, 30000);
