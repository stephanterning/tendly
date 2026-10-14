import { Temporal } from '@js-temporal/polyfill';
import type { Recurrence, TemplateNode } from '@tendly/shared';
export function occurrenceDate(schedule: Recurrence, index: number) {
  // Always add to the original anchor: Jan 31 → Feb 28 → Mar 31, without drift.
  return Temporal.PlainDate.from(schedule.anchor).add({ [schedule.unit]: schedule.interval * index }, { overflow: 'constrain' }).toString();
}
export function* dueOccurrences(schedule: Recurrence, today: string) {
  if (!schedule.enabled) return;
  const horizon = Temporal.PlainDate.from(today).add({ days: schedule.leadDays }).toString();
  for (let i = 0; ; i++) {
    const date = occurrenceDate(schedule, i);
    if (date > horizon) break;
    yield date;
  }
}
export function materializeNodes(nodes: TemplateNode[], date: string, id: () => string) {
  const mapping = new Map(nodes.map(n => [n.sourceId, id()]));
  return nodes.map(node => ({ id: mapping.get(node.sourceId)!, value: { ...node.value,
    parentId: node.value.parentId ? mapping.get(node.value.parentId) ?? null : null,
    blockers: node.value.blockers.map(target => mapping.get(target) ?? target),
    related: node.value.related.map(target => mapping.get(target) ?? target),
    startTime: node.startOffset === null ? null : node.value.startTime,
    deadlineTime: node.deadlineOffset === null ? null : node.value.deadlineTime,
    startDate: node.startOffset === null ? null : Temporal.PlainDate.from(date).add({ days: node.startOffset }).toString(),
    deadlineDate: node.deadlineOffset === null ? null : Temporal.PlainDate.from(date).add({ days: node.deadlineOffset }).toString(),
  } }));
}
