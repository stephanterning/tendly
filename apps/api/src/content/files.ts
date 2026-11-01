import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, stat, readdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { fileTypeFromFile } from 'file-type';
import type { MultipartFile } from '@fastify/multipart';
import type { Actor } from '../accounts/access.js';
import { attachments } from './schema.js';
import { ContentService } from './service.js';
import { AccountError } from '../accounts/errors.js';
const exec = promisify(execFile);
export class FileStore {
  private active = 0;
  constructor(
    readonly service: ContentService,
    readonly root: string,
  ) {}
  path(id: string, preview = false, thumbnail = false) {
    return join(this.root, id + (thumbnail ? '.thumb.jpg' : preview ? '.jpg' : '.original'));
  }
  async cleanupOrphans() {
    await mkdir(this.root, { recursive: true });
    for (const name of await readdir(this.root)) {
      const match = /^([0-9a-f-]{36})\.(original|jpg|thumb\.jpg)$/.exec(name);
      if (!match) continue;
      const path = join(this.root, name);
      const info = await stat(path).catch(() => null);
      // Fresh uploads may not have committed metadata yet. Never sweep recent files.
      if (!info || Date.now() - info.mtimeMs < 24 * 3600_000) continue;
      const [record] = await this.service.db
        .select({ id: attachments.id })
        .from(attachments)
        .where(eq(attachments.id, match[1]!));
      if (!record) await rm(path, { force: true });
    }
  }
  async upload(actor: Actor, householdId: string, taskId: string, part: MultipartFile) {
    await this.service.task(actor, householdId, taskId);
    if (this.active >= 2) {
      part.file.resume();
      throw new AccountError('uploads_busy', 503);
    }
    this.active++;
    const id = randomUUID();
    try {
      await mkdir(this.root, { recursive: true });
      await pipeline(part.file, createWriteStream(this.path(id), { flags: 'wx', mode: 0o600 }));
      if (part.file.truncated) throw new AccountError('file_too_large', 413);
      const size = (await stat(this.path(id))).size;
      if (!size) throw new AccountError('empty_file');
      const type = await fileTypeFromFile(this.path(id));
      const mime = type?.mime ?? 'application/octet-stream';
      const heic = ['heic', 'heif'].includes(type?.ext ?? '');
      if (mime.startsWith('video/')) throw new AccountError('video_not_supported');
      const image =
        heic || ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(mime);
      if (image) {
        try {
          await exec(
            process.execPath,
            [
              '--max-old-space-size=256',
              ...(import.meta.url.endsWith('.ts') ? ['--import', import.meta.resolve('tsx')] : []),
              fileURLToPath(
                new URL(
                  import.meta.url.endsWith('.ts') ? './preview-worker.ts' : './preview-worker.js',
                  import.meta.url,
                ),
              ),
              this.path(id),
              this.path(id, true),
              heic ? 'heic' : 'image',
            ],
            { timeout: 30_000, maxBuffer: 1024 * 64 },
          );
        } catch {
          throw new AccountError('image_preview_failed');
        }
      }
      return await this.service.db.transaction(async (tx) => {
        const home = await this.service.tasks.scope(tx, actor, householdId, true);
        await this.service.tasks.get(tx, householdId, taskId, home.timezone);
        const [row] = await tx
          .insert(attachments)
          .values({
            id,
            householdId,
            taskId,
            name:
              Array.from(part.filename)
                .map((c) =>
                  c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 || c === '/' || c === '\\'
                    ? '_'
                    : c,
                )
                .join('')
                .slice(0, 255) || 'file',
            mime,
            size,
            preview: image,
          })
          .returning();
        return { ...row!, createdAt: row!.createdAt.toISOString() };
      });
    } catch (error) {
      await Promise.all([
        rm(this.path(id), { force: true }),
        rm(this.path(id, true), { force: true }),
        rm(this.path(id, true, true), { force: true }),
      ]);
      throw error;
    } finally {
      this.active--;
    }
  }
}
