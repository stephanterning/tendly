import pg from 'pg';
import { buildApp } from './app.js';
import { readConfig } from './config.js';
const config = readConfig();
const pool = new pg.Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 5000, query_timeout: 5000 });
const app = await buildApp({ version: config.APP_VERSION, logLevel: config.LOG_LEVEL, closeDatabase: async () => { await pool.end(); }, checkDatabase: async () => { await pool.query('SELECT 1'); } });
pool.on('error', () => app.log.error('Database connection failed'));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => { void app.close(); });
}
try { await app.listen({ host: config.HOST, port: config.PORT }); }
catch { app.log.fatal('API startup failed'); await app.close(); process.exitCode = 1; }
