import type { Task, TaskChanges } from '@tendly/shared';
import { api } from '../accounts/api.js';
// Zod optional values may include undefined; JSON requests omit them.
function defined<T extends object>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as { [K in keyof T]: Exclude<T[K], undefined> };
}
export class EditFailure extends Error {
  constructor(message: string, readonly current?: Task, readonly fields?: string[]) { super(message); }
}
export async function patchTask(householdId: string, task: Task, changes: TaskChanges, confirmUnavailable = false) {
  const response = await api.PATCH('/api/v1/households/{householdId}/tasks/{id}', {
    params: { path: { householdId, id: task.id } }, body: { baseVersion: task.version, changes: defined(changes), confirmUnavailable },
  }).catch(() => { throw new EditFailure('network_error'); });
  if (response.error) {
    const error = response.error;
    throw new EditFailure(error.error, 'current' in error ? error.current : undefined, 'fields' in error ? error.fields : undefined);
  }
  if (!response.data) throw new EditFailure('network_error');
  return response.data;
}
