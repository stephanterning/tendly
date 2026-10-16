import { Section } from '../components/Section.js';
import { ListFilter } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { allFilter, filterAstSchema, type Task, type Entity, type FilterAst } from '@tendly/shared';
import { api, result } from '../accounts/api.js';
import { Dialog } from '../components/ui/dialog.js';
import { FilterBuilder } from '../planning/FilterBuilder.js';
import type { Member } from '../tasks/TaskFields.js';
export function Search({ householdId, entities, members, onOpen, onClose, onEntities }: { householdId: string; entities: Entity[]; members: Member[]; onOpen: (id: string) => void; onClose: () => void; onEntities: () => void }) {
  const { t } = useTranslation(), [query, setQuery] = useState(''), [definition, setDefinition] = useState<FilterAst>(allFilter), [currentPlace, setCurrentPlace] = useState<string | null>(null), [draft, setDraft] = useState({ query, definition });
  useEffect(() => { const timer = setTimeout(() => setDraft({ query, definition }), 300); return () => clearTimeout(timer); }, [query, definition]);
  const search = useInfiniteQuery<{ tasks: { task: Task; archived: boolean }[]; entities: Entity[]; count: number; nextOffset: number | null }>({ queryKey: ['planning', householdId, 'search', draft, currentPlace], enabled: filterAstSchema.safeParse(draft.definition).success, initialPageParam: 0, getNextPageParam: last => last.nextOffset ?? undefined, queryFn: ({ pageParam }) => result(api.POST('/api/v1/households/{householdId}/search', { params: { path: { householdId } }, body: { ...draft, currentPlace, offset: Number(pageParam) } })) });
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }} title={t('search')}><label className="sr-only" htmlFor="global-search">{t('search')}</label><input id="global-search" autoFocus type="search" placeholder={t('searchHint')} value={query} onChange={e => setQuery(e.target.value)} /><Section title={t('conditions')} icon={ListFilter}><FilterBuilder value={definition} onChange={setDefinition} entities={entities} members={members} /><label>{t('currentPlace')}<select value={currentPlace ?? ''} onChange={e => setCurrentPlace(e.target.value || null)}><option value="">{t('none')}</option>{entities.filter(e => e.kind === 'place').map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label></Section>
    {search.isError && <p role="alert">{t('network_error')}</p>}<p aria-live="polite" className="muted">{t('resultCount', { count: search.data?.pages[0]?.count ?? 0 })}</p><div className="search-results">{search.data?.pages.flatMap(p => p.tasks).map(({ task, archived }) => <button key={task.id} onClick={() => onOpen(task.id)}><strong>{task.title}</strong><small>{task.ancestors.map(a => a.title).join(' › ')}{archived && ' · ' + t('archived')}</small></button>)}{search.data?.pages[0]?.entities.map(entity => <button key={entity.id} onClick={onEntities}><strong>{entity.name}</strong><small>{t(entity.kind)}</small></button>)}</div>{search.hasNextPage && <button onClick={() => void search.fetchNextPage()}>{t('loadMore')}</button>}
  </Dialog>;
}
