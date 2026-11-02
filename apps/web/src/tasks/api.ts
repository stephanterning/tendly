import type { Task, TaskChanges } from '@tendly/shared';
import { api } from '../accounts/api.js';
// Zod optional values may include undefined; JSON requests omit them.
type JsonDefined<T> = T extends (infer U)[] ? JsonDefined<U>[] : T extends object ? { [K in keyof T]: JsonDefined<Exclude<T[K], undefined>> } : T;
export function defined<T>(value:T):JsonDefined<T> {
  return JSON.parse(JSON.stringify(value)) as JsonDefined<T>;
}
export class EditFailure extends Error {
  constructor(message: string, readonly current?: Task, readonly fields?: string[]) { super(message); }
}
export async function patchTask(householdId: string, task: Task, changes: TaskChanges, confirmUnavailable = false) {
  const signal = AbortSignal.timeout(12_000);
  const response = await api.PATCH('/api/v1/households/{householdId}/tasks/{id}', {
    signal,
    params: { path: { householdId, id: task.id } }, body: { baseVersion: task.version, changes: defined(changes), confirmUnavailable },
  }).catch(() => { throw new EditFailure(signal.aborted ? 'save_timeout' : 'network_error'); });
  if (response.response.status >= 500) throw new EditFailure('network_error');
  if (response.error) {
    const error = response.error;
    throw new EditFailure(error.error, 'current' in error ? error.current : undefined, 'fields' in error ? error.fields : undefined);
  }
  if (!response.data) throw new EditFailure('network_error');
  return response.data;
}
export async function loadTask(householdId: string, id: string): Promise<Task> {
  const response = await api.GET('/api/v1/households/{householdId}/tasks/{id}', {
    params: { path: { householdId, id } }, signal: AbortSignal.timeout(12_000), cache: 'no-store',
  }).catch(() => { throw new EditFailure('network_error'); });
  if (!response.data) throw new EditFailure(response.error?.error ?? 'network_error');
  return response.data;
}
