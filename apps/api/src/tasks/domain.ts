import { Temporal } from '@js-temporal/polyfill';
import { columns, sizes, type TaskColumn, type TaskFields } from '@tendly/shared';
type Workflow = { status: 'todo' | 'in_progress' | 'done'; bucket: 'someday' | 'within_year' | 'within_month' | 'ready'; precedingColumn: string | null };
export function taskColumn(task: Workflow): TaskColumn {
  return task.status === 'todo' ? task.bucket === 'ready' ? 'todo' : task.bucket : task.status;
}
export function moveTaskToColumn(task: Workflow, requested: TaskColumn | 'reopen'): Workflow {
  const before = taskColumn(task);
  const target = requested === 'reopen' ? (columns.filter(c => c !== 'done').includes(task.precedingColumn as Exclude<TaskColumn, 'done'>) ? task.precedingColumn as TaskColumn : 'todo') : requested;
  if (requested === 'reopen' && before !== 'done') return task;
  return {
    status: target === 'in_progress' || target === 'done' ? target : 'todo',
    bucket: target === 'in_progress' || target === 'done' ? task.bucket : target === 'todo' ? 'ready' : target,
    precedingColumn: target === 'done' && before !== 'done' ? before : task.precedingColumn,
  };
}
export const suggestSize = (minutes: number, thresholds: readonly number[]) => sizes[thresholds.findIndex(n => minutes <= n)] ?? 'XL';
export function dateInstant(date: string, time: string | null, timezone: string, endOfDay = false) {
  const day = Temporal.PlainDate.from(date);
  const value = endOfDay && !time ? day.add({ days: 1 }) : day;
  // PostgreSQL's AT TIME ZONE uses the later instant at ambiguous DST wall times.
  return value.toPlainDateTime(time ?? '00:00').toZonedDateTime(timezone, { disambiguation: 'later' }).epochMilliseconds;
}
export function availability(task: Pick<TaskFields, 'startDate' | 'startTime' | 'deadlineDate' | 'deadlineTime' | 'column'>, timezone: string, now = Date.now()) {
  return {
    available: !task.startDate || dateInstant(task.startDate, task.startTime, timezone) <= now,
    overdue: task.column !== 'done' && !!task.deadlineDate && (task.deadlineTime
      ? dateInstant(task.deadlineDate, task.deadlineTime, timezone) < now
      : dateInstant(task.deadlineDate, null, timezone, true) <= now),
  };
}

export function promotedColumn(task: Pick<TaskFields, 'column' | 'startDate' | 'startTime'>, timezone: string, now = Date.now()): TaskColumn {
  const future: TaskColumn[] = ['someday', 'within_year', 'within_month', 'todo'];
  const current = future.indexOf(task.column);
  if (!task.startDate || current < 0 || current === 3) return task.column;
  const today = Temporal.Instant.fromEpochMilliseconds(now).toZonedDateTimeISO(timezone).toPlainDate();
  // Calendar horizons clamp month ends, while the actual start respects an optional local time.
  const target = dateInstant(task.startDate, task.startTime, timezone) <= now ? 3
    : task.startDate <= today.add({ months: 1 }).toString() ? 2
      : task.startDate <= today.add({ years: 1 }).toString() ? 1 : 0;
  return future[Math.max(current, target)]!;
}
