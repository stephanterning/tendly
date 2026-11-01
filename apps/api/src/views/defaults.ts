import { allTasks, nowExpression, type FilterExpression, type ViewFields } from '@tendly/shared';
export const defaultFilters: Record<
  string,
  {
    name: string;
    icon: 'flag' | 'user' | 'map-pin' | 'clock';
    color: 'red' | 'blue' | 'green';
    expression: FilterExpression;
  }
> = {
  high: {
    name: 'High priority',
    icon: 'flag',
    color: 'red',
    expression: { type: 'predicate', field: 'high', operator: 'EQ', value: true },
  },
  mine: {
    name: 'Assigned to me',
    icon: 'user',
    color: 'blue',
    expression: {
      type: 'predicate',
      field: 'assignees',
      operator: 'IN',
      value: { token: 'CURRENT_USER' },
    },
  },
  here: {
    name: 'At my current place',
    icon: 'map-pin',
    color: 'green',
    expression: {
      type: 'predicate',
      field: 'places',
      operator: 'COMPATIBLE',
      value: { token: 'CURRENT_PLACE' },
    },
  },
  small: {
    name: 'Small tasks',
    icon: 'clock',
    color: 'blue',
    expression: { type: 'predicate', field: 'size', operator: 'IN', value: ['XS', 'S'] },
  },
};
export function defaultView(builtin: 'now' | 'board', quickFilters: string[]): ViewFields {
  return {
    name: builtin === 'now' ? 'Now' : 'Board',
    icon: builtin === 'now' ? 'house' : 'layout-grid',
    color: 'blue',
    presentation: builtin === 'now' ? 'list' : 'board',
    expression: builtin === 'now' ? nowExpression : allTasks,
    quickFilters,
    sort: 'manual',
    epicLanes: false,
    showEmptyLanes: false,
    cardProperties: ['epic', 'size', 'high', 'deadline', 'assignees'],
  };
}
