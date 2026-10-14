import { expect, it } from 'vitest';
import { availability, dateInstant, moveTaskToColumn, suggestSize, taskColumn } from './domain.js';
it('keeps six visible columns and reopens to the immediate previous column', () => {
  let task = moveTaskToColumn({ status: 'todo', bucket: 'someday', precedingColumn: null }, 'within_year');
  task = moveTaskToColumn(task, 'in_progress');
  expect(task.bucket).toBe('within_year');
  task = moveTaskToColumn(task, 'done');
  task = moveTaskToColumn(task, 'done');
  expect(taskColumn(moveTaskToColumn(task, 'reopen'))).toBe('in_progress');
  expect(taskColumn(moveTaskToColumn(task, 'within_month'))).toBe('within_month');
});
it('uses household local days including DST and optional explicit times', () => {
  const task = { column: 'todo' as const, startDate: '2026-03-29', startTime: null, deadlineDate: '2026-03-29', deadlineTime: null };
  expect(dateInstant(task.deadlineDate, null, 'Europe/Stockholm', true) - dateInstant(task.startDate, null, 'Europe/Stockholm')).toBe(23 * 3600000);
  expect(availability(task, 'Europe/Stockholm', Date.parse('2026-03-28T22:59:59Z'))).toEqual({ available: false, overdue: false });
  expect(availability(task, 'Europe/Stockholm', Date.parse('2026-03-29T21:59:59Z'))).toEqual({ available: true, overdue: false });
  expect(availability(task, 'Europe/Stockholm', Date.parse('2026-03-29T22:00:00Z')).overdue).toBe(true);
  expect(availability({ ...task, column: 'done' }, 'Europe/Stockholm', Date.parse('2026-03-30T00:00:00Z')).overdue).toBe(false);
  expect(dateInstant('2026-10-25', '02:30', 'Europe/Stockholm')).toBe(Date.parse('2026-10-25T01:30Z'));
});
it('suggests size at inclusive configurable effort boundaries', () => {
  expect([60, 61, 240, 480, 1440, 1441].map(n => suggestSize(n, [60, 240, 480, 1440]))).toEqual(['XS', 'S', 'S', 'M', 'L', 'XL']);
});
