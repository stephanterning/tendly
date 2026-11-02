import { describe, expect, it, vi } from 'vitest';
import { UploadQueue } from './UploadQueue.js';
import type { FileUploader } from './api.js';
const result = { src: '/preview', name: 'Tiles', image: true };
const file = new File(['photo'], 'tiles.png');
const settle = async (queue: UploadQueue) => vi.waitFor(() => expect(queue.getSnapshot().some(e => ['queued', 'uploading', 'processing'].includes(e.state))).toBe(false));

describe('independent file uploads', () => {
  it('continues past a failure and retries only that file with its original ID', async () => {
    const upload = vi.fn<FileUploader>().mockResolvedValue(result).mockRejectedValueOnce(new Error('upload_connection_lost'));
    const queue = new UploadQueue(upload);
    const place = vi.fn(() => true);
    queue.add('first', file, place); queue.add('second', file, place);
    await settle(queue);
    expect(queue.getSnapshot().map(e => e.state)).toEqual(['failed', 'done']);
    expect(place).toHaveBeenCalledTimes(1);
    queue.retry('first'); queue.retry('first');
    await settle(queue);
    expect(upload.mock.calls.map(args => args[1])).toEqual(['first', 'second', 'first']);
    expect(place).toHaveBeenCalledTimes(2);
  });
  it('keeps an uploaded file available when its insertion point was removed, without uploading again', async () => {
    const upload = vi.fn<FileUploader>().mockResolvedValue(result);
    const queue = new UploadQueue(upload);
    queue.add('first', file, () => false);
    await settle(queue);
    expect(queue.getSnapshot()[0]).toMatchObject({ state: 'unplaced', result });
    queue.retry('first'); queue.placed('first');
    expect(upload).toHaveBeenCalledTimes(1);
    expect(queue.getSnapshot()[0]?.state).toBe('done');
  });
  it('discards a waiting file and stops late insertion after unmount', async () => {
    let finish!: (value: typeof result) => void;
    const upload = vi.fn<FileUploader>(() => new Promise(resolve => { finish = resolve; }));
    const queue = new UploadQueue(upload);
    const place = vi.fn(() => true), remove = vi.fn();
    queue.add('first', file, place); queue.add('second', file, place, remove);
    queue.remove('second');
    expect(remove).toHaveBeenCalledTimes(1);
    queue.dispose(); finish(result);
    await Promise.resolve();
    expect(place).not.toHaveBeenCalled();
    expect(upload).toHaveBeenCalledTimes(1);
  });
});
