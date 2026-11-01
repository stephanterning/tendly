import { taskFields, taskSchema, toDocument, type Task, type TaskFields, type TaskChanges } from '@tendly/shared';
import { EditFailure } from './api.js';

type Attempt = { base: Task; draft: TaskFields };
export type DraftBackup = { base: Task; draft: TaskFields; uncertain?: Attempt | undefined };
export type DraftState = DraftBackup & {
  busy: boolean;
  failure: EditFailure | null;
  restored: boolean;
  storageFailed: boolean;
};
function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right))
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => sameValue(value, right[index]));
  // JSONB may reorder object keys; document order is carried by arrays, not keys.
  const a = Object.entries(left).filter(([, value]) => value !== undefined);
  const b = Object.entries(right).filter(([, value]) => value !== undefined);
  return a.length === b.length && a.every(([key, value]) => Object.hasOwn(right, key) && sameValue(value, (right as Record<string, unknown>)[key]));
}
export function changesBetween(base: TaskFields, draft: TaskFields): TaskChanges {
  return Object.fromEntries(Object.entries(draft).filter(([key, value]) =>
    !sameValue(value, base[key as keyof TaskFields])));
}
export function isDirty(state: DraftBackup) {
  return Object.keys(changesBetween(state.base, state.draft)).length > 0;
}

// This is a per-tab recovery copy, never a queue that writes in the background.
export function draftStorage(userId: string, task: Task, storage: Storage) {
  const key = `tendly-task-draft:${userId}:${task.householdId}:${task.id}`;
  const parseFields = (value: unknown): TaskFields => {
    if (!value || typeof value !== 'object' || !('title' in value) || typeof value.title !== 'string' || value.title.length > 300) throw new Error('invalid draft');
    // A temporarily empty title must survive closing/reloading too.
    const estimate = 'estimateMinutes' in value ? value.estimateMinutes : null;
    if (estimate !== null && (typeof estimate !== 'number' || !Number.isFinite(estimate))) throw new Error('invalid draft estimate');
    return { ...taskFields.parse({ ...value, title: 'draft', estimateMinutes: null }), title: value.title, estimateMinutes: estimate };
  };
  const parseAttempt = (value: Attempt): Attempt => {
    const base = taskSchema.parse(value.base);
    if (base.id !== task.id || base.householdId !== task.householdId) throw new Error('wrong draft scope');
    return { base, draft: parseFields(value.draft) };
  };
  return {
    read(): DraftBackup | undefined {
      const text = storage.getItem(key);
      if (!text) return;
      const value = JSON.parse(text) as DraftBackup;
      return { ...parseAttempt(value), ...(value.uncertain ? { uncertain: parseAttempt(value.uncertain) } : {}) };
    },
    write(value: DraftBackup | null) {
      if (value) storage.setItem(key, JSON.stringify(value));
      else storage.removeItem(key);
    },
  };
}

/** Serializes autosave/close/retry around the latest draft, not a render's closure. */
export class TaskDraft {
  private state: DraftState;
  private listeners = new Set<() => void>();
  private running: Promise<boolean> | null = null;
  constructor(task: Task, private io: {
    save: (base: Task, changes: TaskChanges, confirm: boolean) => Promise<Task>;
    load: () => Promise<Task>;
    backup: (draft: DraftBackup | null) => void;
  }, backup?: DraftBackup, storageFailed = false) {
    this.state = { ...(backup ?? { base: task, draft: taskFields.parse(task) }), busy: false, failure: null, restored: !!backup, storageFailed };
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<DraftState>) {
    this.state = { ...this.state, ...patch };
    try {
      this.io.backup(isDirty(this.state) || this.state.uncertain ? {
        base: this.state.base, draft: this.state.draft,
        ...(this.state.uncertain ? { uncertain: this.state.uncertain } : {}),
      } : null);
      this.state = { ...this.state, storageFailed: false };
    } catch { this.state = { ...this.state, storageFailed: true }; }
    this.listeners.forEach(listener => listener());
  }
  edit(changes: Partial<TaskFields>) {
    const failure = this.state.failure;
    this.update({ draft: { ...this.state.draft, ...changes },
      // Editing must never silently dismiss an unresolved conflict/network outcome.
      failure: failure?.message === 'invalid_input' ? null : failure });
  }
  receive(task: Task) {
    if (!isDirty(this.state) && !this.state.busy && !this.state.uncertain && !this.state.restored && task.version > this.state.base.version)
      this.update({ base: task, draft: taskFields.parse(task) });
  }
  private acknowledge(attempt: Attempt, next: Task) {
    // Preserve edits made after the request, including reverting a field to its old value.
    const subsequent = changesBetween(attempt.draft, this.state.draft);
    this.update({ base: next, draft: { ...taskFields.parse(next), ...subsequent } as TaskFields, uncertain: undefined, failure: null });
  }
  private matches(attempt: Attempt, task: Task) {
    const parsed = taskFields.safeParse(attempt.draft);
    if (!parsed.success) return false;
    const expected = { ...parsed.data, description: toDocument(parsed.data.description) };
    return Object.keys(changesBetween(attempt.base, attempt.draft)).every(key =>
      sameValue(task[key as keyof Task], expected[key as keyof TaskFields]));
  }
  private async commit(attempt: Attempt, confirm: boolean) {
    this.update({ uncertain: attempt });
    try {
      return await this.io.save(attempt.base, changesBetween(attempt.base, attempt.draft), confirm);
    } catch (error) {
      if (error instanceof EditFailure && error.current && this.matches(attempt, error.current)) return error.current;
      if (error instanceof EditFailure && !['network_error', 'save_timeout'].includes(error.message)) this.update({ uncertain: undefined });
      throw error;
    }
  }
  flush(options: { retry?: boolean; confirm?: boolean } = {}): Promise<boolean> {
    if (this.running) return this.running;
    if ((this.state.failure || this.state.restored) && !options.retry) return Promise.resolve(false);
    this.running = this.perform(options).finally(() => { this.running = null; this.update({ busy: false }); });
    return this.running;
  }
  private async perform(options: { retry?: boolean; confirm?: boolean }) {
    this.update({ busy: true });
    try {
      if (this.state.uncertain || this.state.restored) {
        // A lost response does not mean the server rejected the write. Read first;
        // any retry still uses its original revision, so a late commit cannot duplicate it.
        const latest = await this.io.load();
        const attempt = this.state.uncertain;
        if (attempt) {
          const next = this.matches(attempt, latest) ? latest : await this.commit(attempt, !!options.confirm);
          this.acknowledge(attempt, next);
        }
        this.update({ restored: false });
      }
      this.update({ failure: null });
      while (isDirty(this.state)) {
        const parsed = taskFields.safeParse(this.state.draft);
        if (!parsed.success) throw new EditFailure('invalid_input', undefined, parsed.error.issues.map(issue => String(issue.path[0])));
        const attempt = { base: this.state.base, draft: this.state.draft };
        const next = await this.commit(attempt, !!options.confirm);
        this.acknowledge(attempt, next);
      }
      return true;
    } catch (error) {
      let failure = error instanceof EditFailure ? error : new EditFailure('network_error');
      if (failure.current && failure.fields) {
        const fields = new Set(failure.fields);
        for (const pair of [['startDate', 'startTime'], ['deadlineDate', 'deadlineTime']]) {
          if (pair.some(field => fields.has(field))) pair.forEach(field => fields.add(field));
        }
        failure = new EditFailure(failure.message, failure.current, [...fields]);
      }
      this.update({ failure });
      return false;
    }
  }
  resolve(useMine: boolean) {
    if (this.state.busy || !this.state.failure?.current) return;
    const { current, fields = [] } = this.state.failure;
    const changes = changesBetween(this.state.base, this.state.draft);
    if (!useMine) for (const field of fields) delete changes[field as keyof TaskChanges];
    this.update({ base: current, draft: { ...taskFields.parse(current), ...changes } as TaskFields, failure: null, uncertain: undefined, restored: false });
  }
  discard(): boolean {
    // Discard is local only. It never cancels or reverses an already-sent server write.
    if (this.state.busy || this.state.uncertain) return false;
    this.update({ draft: taskFields.parse(this.state.base), failure: null, restored: false });
    return !this.state.storageFailed;
  }
}
