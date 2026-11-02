import { routeUrl, type Route } from '../navigation/routes.js';
import { useViewCatalog, filterName } from '../views/api.js';
import { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, result } from '../accounts/api.js';
export function Search({
  householdId,
  openTask,
  openLibrary, route, onSearch,
}: {
  householdId: string;
  openTask: (id: string, comment: string, match: string) => void;
  route: Route;
  onSearch: (q: string, filters: string[]) => void;
  openLibrary: (id: string) => void;
}) {
  const { t } = useTranslation();
  const catalog = useViewCatalog(householdId);
  const filterIds = route.filters, input = route.q;
  const setFilterIds = (ids: string[]) => onSearch(input, ids);
  const setInput = (text: string) => onSearch(text, filterIds);
  const [q, setQ] = useState(input.trim());
  useEffect(() => {
    const timer = setTimeout(() => setQ(input.trim()), 250);
    return () => clearTimeout(timer);
  }, [input]);
  const search = useInfiniteQuery({
    queryKey: ['planning', householdId, 'search', q, filterIds],
    enabled: !!q,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      result(
        api.POST('/api/v1/households/{householdId}/search', {
          params: { path: { householdId } },
          body: { q, offset: pageParam, filterIds },
        }),
      ),
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  });
  return (
    <section className="global-search">
      <h1>{t('search')}</h1>
      <label>
        {t('searchPrompt')}
        <input
          autoFocus
          type="search"
          maxLength={200}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
      </label>
      <details className="search-filters">
        <summary>
          {t('searchTaskFilters')}
          {filterIds.length ? ` (${filterIds.length})` : ''}
        </summary>
        <div className="filter-options">
          {catalog.data?.filters
            .filter((f) => !f.deleted)
            .map((f) => (
              <label className="check-label" key={f.id}>
                <input
                  type="checkbox"
                  checked={filterIds.includes(f.id)}
                  onChange={(e) =>
                    setFilterIds(
                      e.target.checked
                        ? [...filterIds, f.id]
                        : filterIds.filter((id) => id !== f.id),
                    )
                  }
                />
                {filterName(f, t)}
              </label>
            ))}
        </div>
      </details>
      {search.data?.pages[0]?.warnings.map((w) => (
        <p key={w} role="status">
          {t(w)}
        </p>
      ))}
      {q && search.isFetching && <p role="status">{t('loading')}</p>}
      {search.isError && (
        <p role="alert">
          {t('network_error')} <button onClick={() => void search.refetch()}>{t('retry')}</button>
        </p>
      )}
      {q &&
        !search.isFetching &&
        !search.isError &&
        !search.data?.pages.some((p) => p.items.length) && (
          <p role="status">{t('noSearchResults')}</p>
        )}
      <ul className="search-results">
        {search.data?.pages
          .flatMap((p) => p.items)
          .map((hit) => {
            const content = <><small>{t(hit.kind)}</small><strong>{hit.title}</strong><span>{hit.snippet}</span></>;
            return <li key={hit.kind + hit.id}>
              {hit.taskId ? <a href={routeUrl({ ...route, task: hit.taskId, comment: hit.kind === 'comment' ? hit.id : '', match: q })}
                onClick={event => {
                  if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  openTask(hit.taskId!, hit.kind === 'comment' ? hit.id : '', q);
                }}>{content}</a> : <button onClick={() => openLibrary(hit.id)}>{content}</button>}
            </li>;
          })}
      </ul>
      {search.hasNextPage && (
        <button disabled={search.isFetchingNextPage} onClick={() => void search.fetchNextPage()}>
          {t('loadMore')}
        </button>
      )}
    </section>
  );
}
