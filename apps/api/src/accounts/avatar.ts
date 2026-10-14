import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { and, eq, inArray } from 'drizzle-orm';
import type { Database } from './database.js';
import type { Actor } from './access.js';
import { memberships, users } from './schema.js';
import { AccountError } from './errors.js';
export async function saveAvatar(db: Database, actor: Actor, directory: string, image: string | null) {
  let id: string | null = null;
  if (image) {
    const match = image.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/]+=*)$/);
    if (!match) throw new AccountError('invalid_file');
    const bytes = Buffer.from(match[1]!, 'base64');
    if (!bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) throw new AccountError('invalid_file');
    id = randomUUID(); await mkdir(directory, { recursive: true, mode: 0o700 }); await writeFile(join(directory, id), bytes, { flag: 'wx', mode: 0o600 });
  }
  try { await db.update(users).set({ avatar: id }).where(eq(users.id, actor.user.id)); }
  catch (error) { if (id) await unlink(join(directory, id)).catch(() => {}); throw error; }
}
export async function readAvatar(db: Database, actor: Actor, directory: string, id: string) {
  const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.avatar, id));
  if (!owner) throw new AccountError('file_not_found', 404);
  if (owner.id !== actor.user.id) {
    const own = await db.select({ householdId: memberships.householdId }).from(memberships).where(eq(memberships.userId, actor.user.id));
    if (!own.length || !(await db.select().from(memberships).where(and(eq(memberships.userId, owner.id), inArray(memberships.householdId, own.map(m => m.householdId))))).length) throw new AccountError('file_not_found', 404);
  }
  try { return await readFile(join(directory, id)); } catch { throw new AccountError('file_not_found', 404); }
}
