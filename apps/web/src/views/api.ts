import { useQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { viewCatalogSchema, type SavedView, type SavedFilter } from '@tendly/shared';
import { api, result } from '../accounts/api.js';
export function useViewCatalog(householdId: string) {
  return useQuery({
    queryKey: ['planning', householdId, 'views'],
    enabled: !!householdId,
    queryFn: async () =>
      viewCatalogSchema.parse(
        await result(
          api.GET('/api/v1/households/{householdId}/view-catalog', {
            params: { path: { householdId } },
          }),
        ),
      ),
  });
}
export function viewName(view: SavedView, t: TFunction) {
  return view.builtin && view.name === { now: 'Now', board: 'Board' }[view.builtin]
    ? t(view.builtin)
    : view.name;
}
export function filterName(filter: SavedFilter, t: TFunction) {
  const names: Record<string, string> = {
    high: 'High priority',
    mine: 'Assigned to me',
    here: 'At my current place',
    small: 'Small tasks',
  };
  return filter.builtin && names[filter.builtin] === filter.name
    ? t('builtin_' + filter.builtin)
    : filter.name;
}
