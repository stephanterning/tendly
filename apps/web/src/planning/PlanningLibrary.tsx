import { Section } from '../components/Section.js';
import { LayoutGrid, ListFilter, Trash2, History } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { allFilter, cardProperties, defaultView, filterAstSchema, palette, type Entity, type FilterAst, type SavedFilter, type SavedView, type ViewDefinition } from '@tendly/shared';
import { api, result } from '../accounts/api.js';
import { Dialog } from '../components/ui/dialog.js';
import { EntityIcon } from '../tasks/identity.js';
import { IconPicker } from '../tasks/IconPicker.js';
import type { Member } from '../tasks/TaskFields.js';
import { FilterBuilder } from './FilterBuilder.js';
export function usePlanning(householdId: string) {
  return useQuery({ queryKey: ['planning', householdId, 'library'], enabled: !!householdId, queryFn: () => result(api.GET('/api/v1/households/{householdId}/planning', { params: { path: { householdId } } })) });
}
export function PlanningLibrary({ householdId, entities, members, onOpenView }: { householdId: string; entities: Entity[]; members: Member[]; onOpenView: (id: string) => void }) {
  const { t } = useTranslation(), queries = useQueryClient(), library = usePlanning(householdId);
  const [editing, setEditing] = useState<{ kind: 'filter' | 'view'; document?: SavedFilter | SavedView } | null>(null), [error, setError] = useState('');
  const refresh = () => queries.invalidateQueries({ queryKey: ['planning', householdId] });
  async function remove(kind: 'filter' | 'view', doc: SavedFilter | SavedView) {
    if (!window.confirm(t('deleteSharedConfirm'))) return;
    try {
      if (kind === 'filter') await result(api.DELETE('/api/v1/households/{householdId}/filters/{id}', { params: { path: { householdId, id: doc.id } }, body: { baseVersion: doc.version } }));
      else await result(api.DELETE('/api/v1/households/{householdId}/views/{id}', { params: { path: { householdId, id: doc.id } }, body: { baseVersion: doc.version } }));
      await refresh();
    } catch (e) { setError((e as Error).message); }
  }
  return <section><header className="page-heading"><h1 className="icon-label"><LayoutGrid aria-hidden="true" />{t('viewsAndFilters')}</h1></header>{error && <p role="alert">{t(error)}</p>}{library.isError && <button onClick={() => void library.refetch()}>{t('retry')}</button>}
    {(['view', 'filter'] as const).map(kind => <section key={kind}><div className="section-heading"><h2 className="icon-label">{kind === 'view' ? <LayoutGrid size={18} aria-hidden="true" /> : <ListFilter size={18} aria-hidden="true" />}{t(kind === 'view' ? 'savedViews' : 'savedFilters')}</h2><button onClick={() => setEditing({ kind })}>{t('createItem')}</button></div><div className="planning-documents">{(kind === 'view' ? library.data?.views : library.data?.filters)?.map(doc => <article key={doc.id}><EntityIcon name={doc.icon} /><div><strong>{doc.builtin ? t(doc.builtin) : doc.name}</strong><small className="muted">{t('createdBy')} · {members.find(m => m.id === doc.createdBy)?.name ?? 'Tendly'}</small></div><div className="button-row">{kind === 'view' && <button onClick={() => onOpenView(doc.id)}>{t('open')}</button>}<button onClick={() => setEditing({ kind, document: doc })}>{t('edit')}</button><button onClick={() => setEditing({ kind, document: { ...doc, id: '', version: 0, builtin: null, name: doc.name + ' · ' + t('copy') } })}>{t('duplicate')}</button>{!doc.builtin && <button className="quiet danger" onClick={() => void remove(kind, doc)}><Trash2 size={16} aria-hidden="true" />{t('delete')}</button>}</div></article>)}</div></section>)}
    {editing && <DocumentEditor key={editing.kind + (editing.document?.id ?? '')} householdId={householdId} kind={editing.kind} document={editing.document} filters={library.data?.filters ?? []} entities={entities} members={members} onClose={() => setEditing(null)} onSaved={async () => { await refresh(); setEditing(null); }} />}
  </section>;
}
export function DocumentEditor({ householdId, kind, document: doc, filters, entities, members, onClose, onSaved }: { householdId: string; kind: 'filter' | 'view'; document?: SavedFilter | SavedView | undefined; filters: SavedFilter[]; entities: Entity[]; members: Member[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const { t } = useTranslation();
  const [name, setName] = useState(doc?.name ?? ''), [icon, setIcon] = useState(doc?.icon ?? 'list-filter'), [color, setColor] = useState(doc?.color ?? 'blue');
  const [definition, setDefinition] = useState<ViewDefinition>(kind === 'view' && doc ? doc.definition as ViewDefinition : defaultView(false));
  const [expression, setExpression] = useState<FilterAst>(kind === 'filter' && doc ? doc.definition as FilterAst : allFilter);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [preview, setPreview] = useState<FilterAst>(kind === 'filter' ? expression : definition.base);
  const [currentPlace, setCurrentPlace] = useState<string | null>(null);
  const ast = kind === 'filter' ? expression : definition.base;
  useEffect(() => { const timer = setTimeout(() => setPreview(ast), 400); return () => clearTimeout(timer); }, [ast]);
  const matches = useQuery({ queryKey: ['planning', householdId, 'preview', preview, currentPlace], enabled: filterAstSchema.safeParse(preview).success, queryFn: () => result(api.POST('/api/v1/households/{householdId}/filter-preview', { params: { path: { householdId } }, body: { definition: preview, currentPlace } })) });
  const history = useQuery({ queryKey: ['planning', householdId, 'filterHistory', doc?.id], enabled: kind === 'filter' && !!doc?.id, queryFn: () => result(api.GET('/api/v1/households/{householdId}/filters/{id}/history', { params: { path: { householdId, id: doc!.id } } })) });
  async function save() {
    setBusy(true); setError('');
    try {
      if (kind === 'filter') {
        const body = { name, icon, color, definition: expression };
        if (doc?.id) await result(api.PUT('/api/v1/households/{householdId}/filters/{id}', { params: { path: { householdId, id: doc.id } }, body: { ...body, baseVersion: doc.version } }));
        else await result(api.POST('/api/v1/households/{householdId}/filters', { params: { path: { householdId } }, body }));
      } else {
        const body = { name, icon, color, definition };
        if (doc?.id) await result(api.PUT('/api/v1/households/{householdId}/views/{id}', { params: { path: { householdId, id: doc.id } }, body: { ...body, baseVersion: doc.version } }));
        else await result(api.POST('/api/v1/households/{householdId}/views', { params: { path: { householdId } }, body }));
      }
      await onSaved();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }} title={t(kind === 'filter' ? 'editFilter' : 'editView')}><div className="planning-editor"><form onSubmit={e => { e.preventDefault(); void save(); }}><fieldset disabled={busy}>
    <label>{t('entityName')}<input required maxLength={100} value={name} onChange={e => setName(e.target.value)} /></label><IconPicker value={icon} onChange={setIcon} /><label>{t('color')}<select value={color} onChange={e => setColor(e.target.value as typeof color)}>{palette.map(p => <option key={p.id} value={p.id}>{t('color_' + p.id)}</option>)}</select></label>
    {doc?.id && <p className="alert">{t('sharedEditWarning')}</p>}
    <FilterBuilder value={ast} onChange={next => kind === 'filter' ? setExpression(next) : setDefinition({ ...definition, base: next })} entities={entities} members={members} />
    {kind === 'view' && <><label>{t('presentation')}<select value={definition.presentation} onChange={e => setDefinition({ ...definition, presentation: e.target.value as 'board' | 'list' })}><option value="board">{t('board')}</option><option value="list">{t('list')}</option></select></label><label>{t('sort')}<select value={definition.sort} onChange={e => setDefinition({ ...definition, sort: e.target.value as ViewDefinition['sort'] })}>{['manual', 'deadline', 'priority', 'effort', 'created'].map(s => <option key={s} value={s}>{t('sort_' + s)}</option>)}</select></label>
      {(['epicLanes', 'showEmptyLanes', 'subtasks'] as const).map(key => <label className="check-label" key={key}><input type="checkbox" checked={definition[key]} onChange={e => setDefinition({ ...definition, [key]: e.target.checked })} />{t(key)}</label>)}
      <fieldset><legend>{t('quickFilters')}</legend>{filters.map(f => <label className="check-label" key={f.id}><input type="checkbox" checked={definition.quickFilters.includes(f.id)} onChange={e => setDefinition({ ...definition, quickFilters: e.target.checked ? [...definition.quickFilters, f.id] : definition.quickFilters.filter(id => id !== f.id) })} />{f.name}</label>)}</fieldset>
      <fieldset><legend>{t('cardProperties')}</legend>{cardProperties.map(p => <label className="check-label" key={p}><input type="checkbox" checked={definition.cardProperties.includes(p)} onChange={e => setDefinition({ ...definition, cardProperties: e.target.checked ? [...definition.cardProperties, p] : definition.cardProperties.filter(id => id !== p) })} />{t(p)}</label>)}</fieldset>
      {doc?.builtin && <button type="button" onClick={() => setDefinition(defaultView(doc.builtin === 'now'))}>{t('resetDefaults')}</button>}
    </>}
    {!!history.data?.length && <Section title={t('versionHistory')} icon={History}>{history.data.toReversed().map(v => <button type="button" key={v.version} onClick={() => setExpression(v.definition)}>{t('restoreVersion', { version: v.version })} · {new Date(v.createdAt).toLocaleString()}</button>)}</Section>}
    {error && <p role="alert" className="alert error">{t(error)}</p>}<div className="button-row"><button className="primary" disabled={!filterAstSchema.safeParse(ast).success}>{t('save')}</button><button type="button" onClick={onClose}>{t('cancel')}</button></div>
  </fieldset></form><aside className="filter-preview"><h3>{t('livePreview')}</h3><label>{t('currentPlace')}<select value={currentPlace ?? ''} onChange={e => setCurrentPlace(e.target.value || null)}><option value="">{t('none')}</option>{entities.filter(e => e.kind === 'place').map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>{!filterAstSchema.safeParse(ast).success ? <p>{t('completeFilter')}</p> : matches.isError ? <p role="alert">{t('network_error')}</p> : <><p aria-live="polite">{t('resultCount', { count: matches.data?.count ?? 0 })}</p>{matches.data?.missingCurrentPlace && <p>{t('chooseCurrentPlace')}</p>}{matches.data?.items.map(task => <p className="preview-task" key={task.id}>{task.title}</p>)}</>}</aside></div></Dialog>;
}
