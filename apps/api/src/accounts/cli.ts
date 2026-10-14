import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { readConfig } from '../config.js';
import * as schema from '../db/schema.js';
import { AccountService } from './service.js';
import { lockAccounts } from './access.js';
const config = readConfig();
const pool = new pg.Pool({ connectionString: config.DATABASE_URL });
const db = drizzle(pool, { schema });
const service = new AccountService(db, config.PUBLIC_ORIGIN);
const [command, emailArg, action] = process.argv.slice(2);
try {
  if (command === 'setup-code') {
    console.info(await service.createBootstrap());
    console.info('Valid for 30 minutes; enter this code on the setup screen.');
  } else if (command === 'recover' && emailArg) {
    const token = await service.createRecovery(emailArg.trim().toLowerCase(), undefined, true);
    if (!token) throw new Error('Account not found');
    console.info(`${config.PUBLIC_ORIGIN}/#recovery=${token}`);
    console.info('Valid once for 15 minutes. Deliver privately to the account owner.');
  } else if (command === 'deployment-admin' && emailArg && ['grant', 'revoke'].includes(action ?? '')) {
    await db.transaction(async (tx) => {
      await lockAccounts(tx);
      const [user] = await tx.select().from(schema.users).where(eq(schema.users.email, emailArg.trim().toLowerCase()));
      if (!user) throw new Error('Account not found');
      if (action === 'revoke' && (await tx.select().from(schema.users).where(eq(schema.users.deploymentAdmin, true))).length <= 1) throw new Error('Keep at least one deployment administrator');
      await tx.update(schema.users).set({ deploymentAdmin: action === 'grant' }).where(eq(schema.users.id, user.id));
      await tx.delete(schema.sessions).where(eq(schema.sessions.userId, user.id));
      await tx.insert(schema.securityEvents).values({ subjectId: user.id, action: `cli_deployment_admin_${action}` });
    });
    console.info('Deployment privilege updated; affected sessions revoked.');
  } else throw new Error('Use setup-code, recover <email>, or deployment-admin <email> grant|revoke');
} catch {
  console.error('Account command failed. Verify the command, account, database and current permissions.');
  process.exitCode = 1;
} finally { await pool.end(); }
