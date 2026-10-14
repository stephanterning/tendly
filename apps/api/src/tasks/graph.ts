import { type TaskFields, type Task } from '@tendly/shared';
import { availability, dateInstant } from './domain.js';
import { AccountError } from '../accounts/errors.js';
export type GraphNode = { id: string; local: TaskFields; trashed: boolean };
const sets = ['places', 'resources', 'tags'] as const;
const exclusions = { places: 'placeExclusions', resources: 'resourceExclusions', tags: 'tagExclusions' } as const;
export const emptyInherited = { epicId: null, high: false, startDate: null, startTime: null, deadlineDate: null, deadlineTime: null, assignees: [], places: [], resources: [], tags: [] };
export function resolveGraph(nodes: GraphNode[], timezone: string) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const children = new Map<string, string[]>();
  const order: string[] = [];
  for (const node of nodes) {
    const parent = node.local.parentId;
    if (!parent) order.push(node.id);
    else {
      if (!byId.has(parent)) throw new AccountError('invalid_task_reference');
      const siblings = children.get(parent) ?? []; siblings.push(node.id); children.set(parent, siblings);
    }
  }
  // Iteration rather than recursive JS calls keeps deeply nested valid trees usable.
  for (let at = 0; at < order.length; at++) for (const child of children.get(order[at]!) ?? []) order.push(child);
  if (order.length !== nodes.length) throw new AccountError('task_cycle');
  const effective = new Map<string, TaskFields>();
  const blockers = new Map<string, Set<string>>();
  const unfinished = new Map<string, number>();
  for (const id of order) {
    const local = byId.get(id)!.local;
    const parent = local.parentId ? effective.get(local.parentId)! : emptyInherited;
    const next = { ...local };
    for (const key of local.inherit) {
      if (key === 'startDate') { next.startDate = parent.startDate; next.startTime = parent.startTime; }
      else if (key === 'deadlineDate') { next.deadlineDate = parent.deadlineDate; next.deadlineTime = parent.deadlineTime; }
      else if (key === 'epicId') next.epicId = parent.epicId;
      else if (key === 'high') next.high = parent.high;
      else next.assignees = parent.assignees;
    }
    for (const key of sets) next[key] = [...new Set([...parent[key].filter(item => !local[exclusions[key]].includes(item)), ...local[key]])].sort();
    effective.set(id, next);
    blockers.set(id, new Set([...(local.parentId ? blockers.get(local.parentId)! : []), ...local.blockers]));
  }
  for (const id of [...order].reverse()) unfinished.set(id, (children.get(id) ?? []).reduce((sum, child) => {
    const node = byId.get(child)!;
    return sum + (node.trashed ? 0 : (node.local.column === 'done' ? 0 : 1) + unfinished.get(child)!);
  }, 0));
  function link(id: string) { const node = byId.get(id)!; return { id, title: node.local.title, column: node.local.column }; }
  function details(id: string) {
    const node = byId.get(id)!, value = effective.get(id)!;
    const parent = value.parentId ? effective.get(value.parentId)! : emptyInherited;
    const ancestors: Task['ancestors'] = [];
    for (let p = value.parentId; p; p = byId.get(p)!.local.parentId) ancestors.push(link(p));
    const direct = (children.get(id) ?? []).filter(child => !byId.get(child)!.trashed).map(link);
    const effectiveBlockers = [...blockers.get(id)!].map(blocker => {
      const target = byId.get(blocker);
      return { id: blocker, title: target?.local.title ?? null, complete: !!target && !target.trashed && target.local.column === 'done', inherited: !node.local.blockers.includes(blocker) };
    });
    const dates = availability(value, timezone);
    return {
      ...value, local: node.local, inheritedValues: parent, ancestors: ancestors.reverse(), children: direct,
      relatedTasks: node.local.related.filter(peer => byId.has(peer)).map(link), effectiveBlockers, ...dates, available: dates.available && effectiveBlockers.every(b => b.complete),
      progress: { done: direct.filter(c => c.column === 'done').length, total: direct.length },
      unfinishedDescendants: unfinished.get(id)!,
      deadlineBeyondParent: !!value.parentId && !!value.deadlineDate && !!parent.deadlineDate && dateInstant(value.deadlineDate, value.deadlineTime, timezone, true) > dateInstant(parent.deadlineDate, parent.deadlineTime, timezone, true),
    };
  }
  function validateDependencies() {
    // Kahn traversal validates the effective graph, including ancestor-derived edges.
    // Availability intentionally does NOT traverse those blockers' own dependencies.
    const remaining = new Map<string, number>();
    const dependents = new Map<string, string[]>();
    for (const id of order) {
      const targets = [...blockers.get(id)!].filter(target => byId.has(target));
      remaining.set(id, targets.length);
      for (const target of targets) { const list = dependents.get(target) ?? []; list.push(id); dependents.set(target, list); }
    }
    const ready = order.filter(id => remaining.get(id) === 0);
    for (let at = 0; at < ready.length; at++) for (const dependent of dependents.get(ready[at]!) ?? []) {
      const count = remaining.get(dependent)! - 1; remaining.set(dependent, count);
      if (!count) ready.push(dependent);
    }
    if (ready.length !== order.length) throw new AccountError('dependency_cycle');
  }
  return { details, validateDependencies };
}
