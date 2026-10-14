import { expect, it } from 'vitest';
import { occurrenceDate, dueOccurrences, materializeNodes } from './recurrence.js';
import { taskFields } from '@tendly/shared';
it('clamps from the original calendar anchor and materializes on the configured lead day', () => {
  const monthly = { anchor: '2027-01-31', interval: 1, unit: 'months' as const, leadDays: 14, enabled: true };
  expect([0, 1, 2].map(i => occurrenceDate(monthly, i))).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
  expect(occurrenceDate({ ...monthly, anchor: '2024-02-29', unit: 'years' }, 4)).toBe('2028-02-29');
  const yearly = { ...monthly, anchor: '2027-10-01', unit: 'years' as const };
  expect([...dueOccurrences(yearly, '2027-09-16')]).toEqual([]);
  expect([...dueOccurrences(yearly, '2027-09-17')]).toEqual(['2027-10-01']);
  expect(occurrenceDate({ ...monthly, interval: 3, unit: 'weeks' }, 2)).toBe('2027-03-14');
});
it('remaps internal dependencies while preserving external blockers and relative dates', () => {
  const value = taskFields.parse({ parentId: null, inherit: [], placeExclusions: [], resourceExclusions: [], tagExclusions: [], blockers: [], related: [], title: 'Root', description: '', column: 'todo', epicId: null, high: false, size: null, estimateMinutes: null, startDate: null, startTime: null, deadlineDate: null, deadlineTime: null, assignees: [], places: [], resources: [], tags: [] });
  let counter = 0;
  const result = materializeNodes([{ sourceId: 'root', value, startOffset: 0, deadlineOffset: 14 }, { sourceId: 'a', value: { ...value, parentId: 'root' }, startOffset: null, deadlineOffset: null }, { sourceId: 'b', value: { ...value, parentId: 'root', blockers: ['a', 'external'] }, startOffset: 2, deadlineOffset: 7 }], '2027-10-01', () => String(++counter));
  expect(result[2]!.value.blockers).toEqual(['2', 'external']);
  expect(result[2]!.value.parentId).toBe('1');
  expect(result[0]!.value.deadlineDate).toBe('2027-10-15');
});
