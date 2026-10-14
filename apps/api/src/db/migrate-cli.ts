import { migrateDatabase } from './migrate.js';
import { readConfig } from '../config.js';
try {
  await migrateDatabase(readConfig().DATABASE_URL);
  console.info('Tendly migrations complete');
} catch {
  console.error('Tendly migration failed; verify database connectivity and migration compatibility.');
  process.exitCode = 1;
}
