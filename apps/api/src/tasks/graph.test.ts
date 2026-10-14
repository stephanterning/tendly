import { expect, it } from 'vitest';
import type { TaskFields } from '@tendly/shared';
import { resolveGraph, type GraphNode } from './graph.js';
it('resolves thousands of nesting levels without a recursive call-stack limit', () => {
  const local: TaskFields = { parentId: null, inherit: [], placeExclusions: [], resourceExclusions: [], tagExclusions: [], blockers: [], related: [], title: 'Deep task', description: '', column: 'todo', epicId: null, high: true, size: null, estimateMinutes: null, startDate: null, startTime: null, deadlineDate: null, deadlineTime: null, assignees: [], places: [], resources: [], tags: [] };
  const nodes: GraphNode[] = Array.from({ length: 3000 }, (_, i) => ({ id: String(i), trashed: false, local: { ...local, parentId: i ? String(i - 1) : null, high: !i, inherit: i ? ['high'] : [] } }));
  const graph = resolveGraph(nodes, 'UTC');
  graph.validateDependencies();
  expect(graph.details('2999')).toMatchObject({ high: true, available: true });
  expect(graph.details('0').unfinishedDescendants).toBe(2999);
});
