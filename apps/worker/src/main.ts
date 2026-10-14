import { registerLifecycleJobs } from '@tendly/api/lifecycle-worker';
import { registerMailJobs } from '@tendly/api/mail-worker';
import { writeFile, unlink } from 'node:fs/promises';
import { PgBoss } from 'pg-boss';
import pino from 'pino';
import { readConfig } from '@tendly/api/config';
import { logRedaction } from '@tendly/api/logging';
const config = readConfig();
const log = pino({ level: config.LOG_LEVEL, redact: logRedaction });
const boss = new PgBoss({ connectionString: config.DATABASE_URL });
const heartbeat = '/tmp/tendly-worker-ready';
boss.on('error', () => { log.error('Worker database operation failed'); });
await boss.start();
const closeMailDatabase = await registerMailJobs(boss, config);
const closeLifecycleDatabase = await registerLifecycleJobs(boss, config);
await writeFile(heartbeat, String(Date.now()));
const timer = setInterval(() => { void boss.getDb().executeSql('SELECT 1').then(() => writeFile(heartbeat, String(Date.now()))).catch(() => log.error('Worker heartbeat failed')); }, 10000);
log.info('Tendly worker started');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    clearInterval(timer);
    void boss.stop().then(closeMailDatabase).then(closeLifecycleDatabase).then(() => unlink(heartbeat)).catch(() => { process.exitCode = 1; });
  });
}
