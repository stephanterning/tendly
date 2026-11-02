import { describe, expect, it, vi } from 'vitest';
import { taskSchema, toDocument, type Task, type TaskChanges, type TaskFields } from '@tendly/shared';
import { TaskDraft, draftStorage, isDirty, type DraftBackup } from './draft.js';
import { EditFailure } from './api.js';

const task = taskSchema.parse({
  id: '11111111-1111-4111-8111-111111111111', householdId: '22222222-2222-4222-8222-222222222222',
  version: 1, order: 0, title: 'Bathroom', description: toDocument('Original notes'), column: 'todo',
  epicId: null, high: false, size: null, estimateMinutes: null, startDate: null, startTime: null,
  deadlineDate: null, deadlineTime: null, assignees: [], places: [], resources: [], tags: [],
  available: true, overdue: false, createdAt: '2026-11-01', updatedAt: '2026-11-01', completedAt: null, completedBy: null,
});
function updated(base: Task, changes: TaskChanges) { return taskSchema.parse({ ...base, ...changes, version: base.version + 1 }); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
function setup(save = vi.fn(async (base: Task, changes: TaskChanges) => updated(base, changes))) {
  let backup: DraftBackup | null = null;
  const io = { save, load: vi.fn(async () => task), backup: vi.fn((value: DraftBackup | null) => { backup = value; }) };
  return { editor: new TaskDraft(task, io), io, backup: () => backup };
}
const rich = { type: 'doc', content: [
  { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Order samples' }] }] }] },
  { type: 'image', attrs: { src: '/api/v1/households/22222222-2222-4222-8222-222222222222/attachments/33333333-3333-4333-8333-333333333333/preview', alt: 'Inspiration' } },
] } as Exclude<TaskFields['description'], string>;

describe('task draft safety', () => {
  it('drains typing during a save before close can finish, with only one request in flight', async () => {
    const first = deferred<Task>();
    const save = vi.fn(async (base: Task, changes: TaskChanges) => updated(base, changes)).mockImplementationOnce(() => first.promise);
    const { editor } = setup(save);
    editor.edit({ description: rich });
    const autosave = editor.flush();
    editor.edit({ title: 'Bathroom renovation' });
    const close = editor.flush();
    expect(save).toHaveBeenCalledTimes(1);
    expect(close).toBe(autosave);
    first.resolve(updated(task, { description: rich }));
    expect(await close).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]?.[1]).toEqual({ title: 'Bathroom renovation' });
    expect(editor.getSnapshot().base.description).toEqual(rich);
    expect(isDirty(editor.getSnapshot())).toBe(false);
  });

  it('preserves reverting to the old value while the first request is pending', async () => {
    const first = deferred<Task>();
    const { editor, io } = setup(vi.fn(async (base: Task, changes: TaskChanges) => updated(base, changes)).mockImplementationOnce(() => first.promise));
    editor.edit({ title: 'Temporary title' });
    const saving = editor.flush();
    editor.edit({ title: task.title });
    first.resolve(updated(task, { title: 'Temporary title' }));
    await saving;
    expect(io.save.mock.calls[1]?.[1]).toEqual({ title: 'Bathroom' });
    expect(editor.getSnapshot().base.title).toBe('Bathroom');
  });

  it('preserves remote changes to unrelated fields and only replaces reviewed conflict fields', async () => {
    const latest = updated(task, { title: 'Remote title', high: true });
    const { editor, io } = setup(vi.fn(async (base: Task, changes: TaskChanges) => updated(base, changes))
      .mockRejectedValueOnce(new EditFailure('task_conflict', latest, ['title'])));
    editor.edit({ title: 'Local title', description: rich });
    expect(await editor.flush()).toBe(false);
    editor.edit({ size: 'L' });
    expect(await editor.flush()).toBe(false);
    expect(io.save).toHaveBeenCalledTimes(1);
    editor.resolve(false);
    expect(editor.getSnapshot().draft).toMatchObject({ title: 'Remote title', high: true, description: rich, size: 'L' });
    await editor.flush();
    expect(io.save.mock.calls[1]?.[1]).toEqual({ description: rich, size: 'L' });
  });

  it('keeps the reviewed rich draft when applying mine, without replacing unrelated remote changes', async () => {
    const latest = updated(task, { description: toDocument('Remote decision'), high: true });
    const { editor, io } = setup(vi.fn(async (base: Task, changes: TaskChanges) => updated(base, changes))
      .mockRejectedValueOnce(new EditFailure('task_conflict', latest, ['description'])));
    editor.edit({ description: rich });
    await editor.flush();
    editor.resolve(true);
    await editor.flush();
    expect(io.save.mock.calls[1]?.[0].version).toBe(latest.version);
    expect(io.save.mock.calls[1]?.[1]).toEqual({ description: rich });
    expect(editor.getSnapshot().base.high).toBe(true);
  });

  it('treats a date and its time as one conflict when accepting the latest version', async () => {
    const base = updated(task, { startDate: '2026-11-02', startTime: '08:00' });
    const latest = updated(base, { startTime: '09:00' });
    const { io } = setup();
    io.save.mockRejectedValueOnce(new EditFailure('task_conflict', latest, ['startTime']));
    const editor = new TaskDraft(base, io);
    editor.edit({ startDate: '2026-11-03', description: rich });
    await editor.flush();
    editor.resolve(false);
    expect(editor.getSnapshot().draft).toMatchObject({ startDate: '2026-11-02', startTime: '09:00', description: rich });
  });

  it('reads after a lost response and does not repeat an already committed change', async () => {
    const { editor, io, backup } = setup(vi.fn(async (base: Task, changes: TaskChanges) => updated(base, changes))
      .mockRejectedValueOnce(new EditFailure('save_timeout')));
    editor.edit({ description: rich });
    await editor.flush();
    expect(backup()?.uncertain?.draft.description).toEqual(rich);
    expect(editor.discard()).toBe(false);
    io.load.mockResolvedValue(updated(task, { description: rich }));
    expect(await editor.flush({ retry: true })).toBe(true);
    expect(io.save).toHaveBeenCalledTimes(1);
    expect(backup()).toBeNull();
  });

  it('settles an uncertain original request before sending subsequent edits, using the original version', async () => {
    const { editor, io } = setup(vi.fn(async (base: Task, changes: TaskChanges) => updated(base, changes))
      .mockRejectedValueOnce(new EditFailure('network_error')));
    editor.edit({ title: 'First attempt' });
    await editor.flush();
    editor.edit({ title: 'Final title', description: rich });
    await editor.flush({ retry: true });
    expect(io.load).toHaveBeenCalledTimes(1);
    expect(io.save.mock.calls[1]?.[0].version).toBe(1);
    expect(io.save.mock.calls[1]?.[1]).toEqual({ title: 'First attempt' });
    expect(io.save.mock.calls[2]?.[1]).toEqual({ title: 'Final title', description: rich });
  });

  it('recognizes saved rich content after JSONB reorders keys, while preserving document order and checkbox edits', async () => {
    const reordered = JSON.parse(JSON.stringify(rich, (_key, value: unknown) =>
      value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).reverse()) : value)) as typeof rich;
    expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(rich));
    const { editor, io } = setup(vi.fn(async (base: Task, changes: TaskChanges) => updated(base, changes))
      .mockRejectedValueOnce(new EditFailure('save_timeout')));
    editor.edit({ title: ' Bathroom renovation ', description: rich });
    await editor.flush();
    io.load.mockResolvedValue(updated(task, { title: 'Bathroom renovation', description: reordered }));
    expect(await editor.flush({ retry: true })).toBe(true);
    expect(io.save).toHaveBeenCalledTimes(1);
    editor.edit({ description: rich });
    expect(isDirty(editor.getSnapshot())).toBe(false);
    editor.edit({ description: { ...rich, content: [...rich.content!].reverse() } });
    expect(isDirty(editor.getSnapshot())).toBe(true);
    editor.edit({ description: JSON.parse(JSON.stringify(rich).replace('"checked":true', '"checked":false')) as typeof rich });
    expect(isDirty(editor.getSnapshot())).toBe(true);
  });

  it('recognizes a late commit racing with retry without another write or false conflict', async () => {
    const late = updated(task, { description: rich });
    const { editor, io } = setup(vi.fn(async (base: Task, changes: TaskChanges) => updated(base, changes))
      .mockRejectedValueOnce(new EditFailure('save_timeout'))
      .mockRejectedValueOnce(new EditFailure('task_conflict', late, ['description'])));
    editor.edit({ description: rich });
    await editor.flush();
    expect(await editor.flush({ retry: true })).toBe(true);
    expect(io.save).toHaveBeenCalledTimes(2);
    expect(editor.getSnapshot().failure).toBeNull();
  });

  it('keeps an uncertain write when checking fails and never resumes silently', async () => {
    const { editor, io } = setup(vi.fn(async (base: Task, changes: TaskChanges) => updated(base, changes)).mockRejectedValueOnce(new EditFailure('network_error')));
    editor.edit({ description: rich });
    await editor.flush();
    io.load.mockRejectedValue(new Error('offline'));
    await editor.flush({ retry: true });
    expect(editor.getSnapshot().uncertain).toBeDefined();
    expect(await editor.flush()).toBe(false);
    expect(io.save).toHaveBeenCalledTimes(1);
    expect(editor.getSnapshot().draft.description).toEqual(rich);
  });

  it('restores blank titles and rich content per user/household/task, pausing autosave until review', async () => {
    const entries = new Map<string, string>();
    const storage = { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); }, removeItem: (key: string) => { entries.delete(key); } } as Storage;
    const cache = draftStorage('user-a', task, storage);
    const { editor, io } = setup();
    editor.edit({ title: '', description: rich });
    await editor.flush();
    expect(io.save).not.toHaveBeenCalled();
    expect(editor.getSnapshot().failure?.fields).toContain('title');
    cache.write(editor.getSnapshot());
    expect(draftStorage('user-b', task, storage).read()).toBeUndefined();
    const restored = new TaskDraft(task, { ...io, backup: cache.write }, cache.read());
    expect(restored.getSnapshot().draft).toMatchObject({ title: '', description: rich });
    restored.edit({ title: 'Restored title' });
    expect(await restored.flush()).toBe(false);
    expect(await restored.flush({ retry: true })).toBe(true);
    expect(cache.read()).toBeUndefined();
  });

  it('reports unavailable recovery storage and never claims the unsaved draft is saved', async () => {
    const { io } = setup();
    const editor = new TaskDraft(task, { ...io, backup: () => { throw new Error('quota exceeded'); } });
    editor.edit({ description: rich });
    expect(editor.getSnapshot().storageFailed).toBe(true);
    expect(isDirty(editor.getSnapshot())).toBe(true);
    expect(editor.discard()).toBe(false);
  });
});
