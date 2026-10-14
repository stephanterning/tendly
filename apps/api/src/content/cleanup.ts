import { users } from '../accounts/schema.js';
import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { Database } from '../accounts/database.js';
import { files } from './schema.js';
export async function cleanOrphanFiles(db: Database, directory: string) {
  const known = new Set((await db.select({ id: files.id }).from(files)).map(f => f.id));
  for (const user of await db.select({ avatar: users.avatar }).from(users)) if (user.avatar) known.add(user.avatar);
  const names = await readdir(directory).catch(() => [] as string[]);
  for (const name of names) {
    if (!/^[0-9a-f-]{36}$/i.test(name) || known.has(name)) continue;
    const path = join(directory, name), info = await stat(path).catch(() => null);
    // Uploads write bytes before committing metadata. A grace period avoids racing an in-flight upload.
    if (info?.isFile() && Date.now() - info.mtimeMs > 86400000) await unlink(path).catch(() => {});
  }
}
