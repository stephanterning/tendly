import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Task, TaskFields } from '@tendly/shared';
import { api, result } from '../accounts/api.js';
export function TaskStructure({ task, draft, householdId, onChange, onOpen, onCreated, onToggle }: {
  task: Task; draft: TaskFields; householdId: string; onChange: (changes: Partial<TaskFields>) => void;
  onOpen: (id: string) => void; onCreated: (task: Task) => void; onToggle: (id: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function run(action: () => Promise<void>) { setBusy(true); setError(''); try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'operation_failed'); } finally { setBusy(false); } }
  return <fieldset disabled={busy} className="task-structure">
    {error && <p role="alert" className="alert error">{t(error)}</p>}
    {task.ancestors.length > 0 && <nav className="task-ancestors" aria-label={t('taskPath')}>{task.ancestors.map(parent => <button type="button" className="quiet" key={parent.id} onClick={() => onOpen(parent.id)}>{parent.title} ›</button>)}</nav>}
    <details className="properties"><summary>{t('parentTask')}</summary>
      {draft.parentId && <button type="button" onClick={() => onChange({ parentId: null })}>{t('makeTopLevel')}</button>}
      <TaskPicker householdId={householdId} label={t('chooseParent')} exclude={[task.id]} onChoose={id => onChange({ parentId: id })} />
      <p className="small muted">{t('reparentHelp')}</p>
    </details>
    <section className="subtasks"><h3>{t('subtasks')} <span className="muted">{task.progress.done}/{task.progress.total}</span></h3>
      <ul className="task-links">{task.children.map(child => <li key={child.id}><button type="button" className="icon-button" aria-label={t(child.column === 'done' ? 'reopen' : 'complete') + ' · ' + child.title} aria-pressed={child.column === 'done'} onClick={() => void run(() => onToggle(child.id))}>{child.column === 'done' ? '✓' : '○'}</button><button type="button" className="quiet" onClick={() => onOpen(child.id)}>{child.title}<small>{t('column_' + child.column)}</small></button></li>)}</ul>
      <form className="subtask-capture" onSubmit={e => { e.preventDefault(); void run(async () => {
        const created = await result(api.POST('/api/v1/households/{householdId}/tasks', { params: { path: { householdId } }, body: { title, parentId: task.id } }));
        setTitle(''); onCreated(created);
      }); }}><label className="sr-only" htmlFor="subtask-title">{t('subtaskTitle')}</label><input id="subtask-title" required maxLength={300} placeholder={t('subtaskTitle')} value={title} onChange={e => setTitle(e.target.value)} /><button type="submit">{t('addSubtask')}</button></form>
    </section>
    <details className="properties" open={task.effectiveBlockers.length > 0 || undefined}><summary>{t('blockedBy')}</summary>
      <ul className="task-links">{task.effectiveBlockers.map(blocker => <li key={blocker.id}>
        <button type="button" className="quiet" disabled={!blocker.title} onClick={() => onOpen(blocker.id)}>{blocker.complete ? '✓ ' : '○ '}{blocker.title ?? t('deletedBlocker')}{blocker.inherited && <small>{t('inherited')}</small>}</button>
        {!blocker.inherited && <button type="button" aria-label={t('removeLink') + ' · ' + (blocker.title ?? t('deletedBlocker'))} onClick={() => onChange({ blockers: draft.blockers.filter(id => id !== blocker.id) })}>×</button>}
      </li>)}</ul>
      <TaskPicker householdId={householdId} label={t('addBlocker')} exclude={[task.id, ...draft.blockers]} onChoose={id => onChange({ blockers: [...draft.blockers, id] })} />
    </details>
    <details className="properties" open={task.relatedTasks.length > 0 || undefined}><summary>{t('relatedTo')}</summary>
      <ul className="task-links">{task.relatedTasks.map(peer => <li key={peer.id}><button type="button" className="quiet" onClick={() => onOpen(peer.id)}>{peer.title}</button><button type="button" aria-label={t('removeLink') + ' · ' + peer.title} onClick={() => onChange({ related: draft.related.filter(id => id !== peer.id) })}>×</button></li>)}</ul>
      <TaskPicker householdId={householdId} label={t('addRelated')} exclude={[task.id, ...draft.related]} onChoose={id => onChange({ related: [...draft.related, id] })} />
    </details>
  </fieldset>;
}
function TaskPicker({ householdId, label, exclude, onChoose }: { householdId: string; label: string; exclude: string[]; onChoose: (id: string) => void }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState(''), [open, setOpen] = useState(false);
  const query = useInfiniteQuery({ queryKey: ['planning', householdId, 'picker', search], initialPageParam: 0, enabled: open,
    queryFn: ({ pageParam }) => result(api.GET('/api/v1/households/{householdId}/tasks', { params: { path: { householdId }, query: { view: 'board', includeSubtasks: 'true', search, offset: pageParam, limit: 30 } } })),
    getNextPageParam: page => page.nextOffset ?? undefined,
  });
  return <div className="task-picker"><button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>{label}</button>{open && <>
    <label>{t('findTask')}<input type="search" maxLength={200} value={search} onChange={e => setSearch(e.target.value)} /></label>
    {query.isError && <p role="alert">{t('network_error')} <button type="button" onClick={() => void query.refetch()}>{t('retry')}</button></p>}
    {query.isPending ? <p role="status">{t('loading')}</p> : <ul className="task-picker-results">{query.data?.pages.flatMap(page => page.items).filter(item => !exclude.includes(item.id)).map(item => <li key={item.id}><button type="button" onClick={() => { onChoose(item.id); setOpen(false); }}>{item.title}<small>{item.ancestors.map(a => a.title).join(' › ') || t('column_' + item.column)}</small></button></li>)}</ul>}
    {query.hasNextPage && <button type="button" onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage}>{t('loadMore')}</button>}
  </>}</div>;
}
