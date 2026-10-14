import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { House, LayoutGrid, MoreHorizontal, Plus, PanelLeftClose, PanelLeftOpen, Check, Flag, Clock3, Settings2, Shapes, ArrowLeft } from 'lucide-react';
import { columns, type Account, type Task, type TaskChanges, type TaskColumn, type Entity } from '@tendly/shared';
import { api, result } from '../accounts/api.js';
import { Settings } from '../accounts/Settings.js';
import type { EntryLink } from '../accounts/Auth.js';
import { Dialog } from '../components/ui/dialog.js';
import { EntityIcon, epicStyle } from './identity.js';
import { TaskEditor } from './TaskEditor.js';
import { TaskFields, emptyTask, type Member } from './TaskFields.js';
import { patchTask, EditFailure } from './api.js';
import { Library } from './Library.js';

type HistoryEntry = { current: Task; inverse: TaskChanges; forward: TaskChanges };
export function Workspace({ account, refresh, link, clearLink, useInvitation }: {
  account: Account; refresh: () => Promise<void>; link: EntryLink; clearLink: () => void; useInvitation: (code: string) => void;
}) {
  const { t } = useTranslation();
  const queries = useQueryClient();
  const [householdId, setHouseholdId] = useState(account.households[0]?.id ?? '');
  const household = account.households.find(h => h.id === householdId) ?? account.households[0];
  const id = household?.id ?? '';
  const [view, setView] = useState<'now' | 'board' | 'more' | 'library' | 'settings'>(link ? 'settings' : 'now');
  const [collapsed, setCollapsed] = useState(false);
  const [column, setColumn] = useState<TaskColumn>('todo');
  const [capture, setCapture] = useState<TaskColumn | null>(null);
  const [confirmStart, setConfirmStart] = useState<Task | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [notice, setNotice] = useState(''), [error, setError] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [redo, setRedo] = useState<HistoryEntry[]>([]);
  const mutationBusy = useRef(false);
  const swipeStart = useRef({ x: 0, y: 0 }), lastSwipe = useRef(0);
  useEffect(() => { if (link) setView('settings'); }, [link]);
  const entities = useQuery({ queryKey: ['planning', id, 'entities'], enabled: !!id, queryFn: () => result(api.GET('/api/v1/households/{householdId}/entities', { params: { path: { householdId: id } } })) });
  const members = useQuery({ queryKey: ['planning', id, 'members'], enabled: !!id, queryFn: () => result(api.GET('/api/v1/households/{id}/members', { params: { path: { id } } })) });
  const listView = view === 'now' ? 'now' : 'board';
  const list = useInfiniteQuery<{ items: Task[]; nextOffset: number | null }>({
    queryKey: ['planning', id, 'tasks', listView], enabled: !!id && (view === 'now' || view === 'board'),
    initialPageParam: 0, getNextPageParam: (last: { items: Task[]; nextOffset: number | null }) => last.nextOffset ?? undefined,
    queryFn: ({ pageParam }) => result(api.GET('/api/v1/households/{householdId}/tasks', { params: { path: { householdId: id }, query: { view: listView, offset: Number(pageParam), limit: 100 } } })),
    refetchInterval: 30_000,
  });
  const detail = useQuery({ queryKey: ['planning', id, 'task', selected], enabled: !!id && !!selected, queryFn: () => result(api.GET('/api/v1/households/{householdId}/tasks/{id}', { params: { path: { householdId: id, id: selected! } } })) });
  const items = list.data?.pages.flatMap(page => page.items) ?? [];
  async function saved(task: Task) {
    queries.setQueryData(['planning', id, 'task', task.id], task);
    await queries.invalidateQueries({ queryKey: ['planning', id, 'tasks'] });
  }
  async function change(base: Task, changes: TaskChanges, confirmed = false) {
    const next = await patchTask(id, base, changes, confirmed);
    const inverse = Object.fromEntries(Object.keys(changes).map(key => [key, base[key as keyof Task]])) as TaskChanges;
    if (changes.estimateMinutes !== undefined && next.size !== base.size) inverse.size = base.size;
    setHistory(old => [...old.slice(-19), { current: next, inverse, forward: changes }]); setRedo([]);
    await saved(next);
    return next;
  }
  async function toggle(task: Task, confirmed = false) {
    if (mutationBusy.current) return;
    mutationBusy.current = true; setError('');
    try { await change(task, { column: task.column === 'done' ? 'reopen' : 'done' }, confirmed); setConfirmStart(null); setNotice('changed'); }
    catch (e) { if (e instanceof EditFailure && e.message === 'confirm_unavailable') { setConfirmStart(task); return; } setError(e instanceof EditFailure && e.message === 'task_conflict' ? 'conflictTitle' : e instanceof Error ? e.message : 'operation_failed'); await list.refetch(); }
    finally { mutationBusy.current = false; }
  }
  async function undo(isRedo = false) {
    const entry = (isRedo ? redo : history).at(-1);
    if (!entry || mutationBusy.current) return;
    mutationBusy.current = true; setError('');
    try {
      const next = await patchTask(id, entry.current, isRedo ? entry.forward : entry.inverse);
      const nextEntry = { ...entry, current: next };
      if (isRedo) { setRedo(old => old.slice(0, -1)); setHistory(old => [...old, nextEntry]); }
      else { setHistory(old => old.slice(0, -1)); setRedo(old => [...old, nextEntry]); }
      await saved(next); setNotice('changed');
    } catch { setError('undoConflict'); }
    finally { mutationBusy.current = false; }
  }
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable=true], [role=dialog]')) return;
      if (event.key.toLowerCase() === 'n' && !event.metaKey && !event.ctrlKey && !event.altKey && id) { event.preventDefault(); setCapture('someday'); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); void undo(event.shiftKey); }
    }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  });
  const navigation = [{ key: 'now', icon: House }, { key: 'board', icon: LayoutGrid }, { key: 'more', icon: MoreHorizontal }] as const;
  function switchHousehold(value: string) { setHouseholdId(value); setSelected(null); setCapture(null); setHistory([]); setRedo([]); setNotice(''); setError(''); }
  return <div className={'workspace ' + (collapsed ? 'nav-collapsed' : '')}>
    <aside className="workspace-nav">
      <div className="brand"><House size={23} /><span>Tendly</span></div>
      {account.households.length > 1 ? <label className="household-switch"><span className="sr-only">{t('household')}</span><select value={id} onChange={e => switchHousehold(e.target.value)}>{account.households.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label> : <p className="nav-household muted">{household?.name}</p>}
      <nav aria-label="Tendly">{navigation.map(({ key, icon: Icon }) => <button key={key} aria-label={t(key)} aria-current={view === key || key === 'more' && ['library', 'settings'].includes(view) ? 'page' : undefined} onClick={() => setView(key)}><Icon size={21} /><span>{t(key)}</span></button>)}</nav>
      <button className="nav-collapse quiet" aria-label={t(collapsed ? 'expandNav' : 'collapseNav')} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}</button>
      <div className="nav-person"><span className="avatar">{account.name.slice(0, 1).toUpperCase()}</span><span>{account.name}</span></div>
    </aside>
    <main className="workspace-main" tabIndex={-1}>
      {account.households.length > 1 && <label className="mobile-household-switch">{t('household')}<select value={id} onChange={e => switchHousehold(e.target.value)}>{account.households.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label>}
      {['now', 'board'].includes(view) && <>
        <header className="page-heading"><div><p className="eyebrow">{household?.name ?? 'Tendly'}</p><h1>{t(view)}</h1>{view === 'now' && <p className="muted">{t('todayFocus')}</p>}</div><button className="desktop-capture primary" onClick={() => setCapture('someday')} disabled={!id}><Plus size={19} />{t('newTask')}</button></header>
        {!household && <div className="empty-state"><p>{t('noMembership')}</p><button onClick={() => setView('settings')}>{t('accountSettings')}</button></div>}
        {error && <p role="alert" className="alert error">{t(error)}</p>}
        {list.isError && <div role="alert" className="alert error">{t('network_error')} <button onClick={() => void list.refetch()}>{t('retry')}</button></div>}
        {(list.isPending && id) ? <p role="status">{t('loading')}</p> : view === 'now' ? <div className="now-list">
          {!items.length && id && <div className="empty-state"><div className="empty-symbol"><House size={30} /></div><h2>{t('noTasks')}</h2><p>{t('noNowTasks')}</p><button onClick={() => setView('board')}>{t('board')}</button></div>}
          {items.map(task => <TaskCard key={task.id} task={task} entities={entities.data ?? []} members={members.data ?? []} open={() => setSelected(task.id)} complete={() => void toggle(task)} />)}
        </div> : <>
          <label className="mobile-column-select">{t('column')}<select value={column} onChange={e => setColumn(e.target.value as TaskColumn)}>{columns.map(c => <option key={c} value={c}>{t('column_' + c)}</option>)}</select></label>
          <div className="board" onTouchStart={e => { swipeStart.current = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY }; }} onTouchEnd={e => {
            const dx = e.changedTouches[0]!.clientX - swipeStart.current.x, dy = e.changedTouches[0]!.clientY - swipeStart.current.y;
            if (Math.abs(dx) > 70 && Math.abs(dy) < 50) { const next = columns[columns.indexOf(column) + (dx < 0 ? 1 : -1)]; if (next) setColumn(next); lastSwipe.current = Date.now(); }
          }} onClickCapture={e => { if (Date.now() - lastSwipe.current < 350) { e.preventDefault(); e.stopPropagation(); } }}>
            {columns.map(c => <section className="board-column" key={c} data-active={column === c}><header><h2>{t('column_' + c)}</h2><button className="quiet icon-button" aria-label={t('addTask') + ' · ' + t('column_' + c)} onClick={() => setCapture(c)}><Plus size={18} /></button></header>
              <div className="column-cards">{items.filter(task => task.column === c).map(task => <TaskCard key={task.id} task={task} entities={entities.data ?? []} members={members.data ?? []} open={() => setSelected(task.id)} complete={() => void toggle(task)} />)}</div>
              <button className="column-add" onClick={() => setCapture(c)}><Plus size={16} />{t('addTask')}</button>
            </section>)}
          </div>
        </>}
        {list.hasNextPage && <button disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>{t('loadMore')}</button>}
      </>}
      {view === 'more' && <><header className="page-heading"><h1>{t('more')}</h1></header><div className="more-links">{id && <button onClick={() => setView('library')}><Shapes size={24} /><span>{t('library')}<small>{t('epics')} · {t('places')} · {t('resources')} · {t('tags')}</small></span></button>}<button onClick={() => setView('settings')}><Settings2 size={24} /><span>{t('accountSettings')}</span></button></div></>}
      {view === 'library' && household && <><button className="quiet" onClick={() => setView('more')}><ArrowLeft size={17} />{t('back')}</button><Library householdId={id} entities={entities.data ?? []} admin={household.role === 'admin'} /></>}
      {view === 'settings' && <><button className="quiet" onClick={() => setView('more')}><ArrowLeft size={17} />{t('back')}</button><Settings key={id} embedded activeHouseholdId={id} account={account} refresh={refresh} link={link} clearLink={clearLink} useInvitation={useInvitation} /></>}
    </main>
    <nav className="mobile-nav" aria-label="Tendly">{navigation.map(({ key, icon: Icon }) => <button key={key} aria-current={view === key || key === 'more' && ['library', 'settings'].includes(view) ? 'page' : undefined} onClick={() => setView(key)}><Icon size={22} /><span>{t(key)}</span></button>)}<button className="capture-fab" aria-label={t('newTask')} disabled={!id} onClick={() => setCapture('someday')}><Plus size={29} /></button></nav>
    {notice && <div className="task-toast" role="status"><span>{t(notice)}</span>{notice === 'created' && createdId && <button onClick={() => { setSelected(createdId); setNotice(''); }}>{t('viewTask')}</button>}{history.length > 0 && <button onClick={() => void undo()}>{t('undo')}</button>}<button className="quiet" aria-label={t('close')} onClick={() => setNotice('')}>×</button></div>}
    {capture && household && <Capture column={capture} timezone={household.timezone} entities={entities.data ?? []} members={members.data ?? []} onClose={() => setCapture(null)} onCreate={async value => {
      const task = await result(api.POST('/api/v1/households/{householdId}/tasks', { params: { path: { householdId: id } }, body: value }));
      await saved(task); setCapture(null); setCreatedId(task.id); setNotice('created');
    }} />}
    {confirmStart && <Dialog open onOpenChange={open => { if (!open) setConfirmStart(null); }} title={t('reopen')}><p>{t('confirm_unavailable')}</p><button className="primary" onClick={() => void toggle(confirmStart, true)}>{t('startAnyway')}</button></Dialog>}
    {selected && detail.isError && <Dialog open onOpenChange={open => { if (!open) setSelected(null); }} title={t('taskDetails')}><p role="alert">{t('task_not_found')}</p><button onClick={() => void detail.refetch()}>{t('retry')}</button></Dialog>}
    {selected && detail.data && household && <TaskEditor key={detail.data.id} task={detail.data} entities={entities.data ?? []} members={members.data ?? []} timezone={household.timezone} onSave={change} onRefresh={task => { void saved(task); }} onClose={() => setSelected(null)} />}
  </div>;
}
function TaskCard({ task, entities, members, open, complete }: { task: Task; entities: Entity[]; members: Member[]; open: () => void; complete: () => void }) {
  const { t, i18n } = useTranslation();
  const epic = entities.find(e => e.id === task.epicId);
  return <article className={'task-card ' + (epic ? 'has-epic ' : '') + (task.column === 'done' ? 'completed' : '')} style={epicStyle(epic)}>
    <button className="card-open" onClick={open} aria-label={task.title}>
      {epic && <span className="card-icon"><EntityIcon name={epic.icon} size={26} /></span>}
      <span className="card-content"><strong>{task.title}</strong><span className="card-metadata">
        {task.high && <span title={t('high')}><Flag size={13} aria-label={t('high')} /></span>}
        {task.deadlineDate && <span className={task.overdue ? 'deadline overdue' : 'deadline'}>{task.overdue && <span>{t('overdue')} · </span>}{new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(task.deadlineDate + 'T12:00:00Z'))}</span>}
        {!task.available && <span title={t('unavailable')}><Clock3 size={13} />{t('unavailable')}</span>}
        {task.assignees.map(id => <span className="card-avatar" key={id} title={members.find(m => m.id === id)?.name}>{members.find(m => m.id === id)?.name.slice(0, 1).toUpperCase()}</span>)}
      </span></span>
      {task.size && <span className="size-chip">{task.size}</span>}
    </button>
    <button className="card-complete" aria-label={t(task.column === 'done' ? 'reopen' : 'complete') + ' · ' + task.title} aria-pressed={task.column === 'done'} onClick={complete}><span>{task.column === 'done' && <Check size={15} />}</span></button>
  </article>;
}
function Capture({ column, timezone, entities, members, onClose, onCreate }: {
  column: TaskColumn; timezone: string; entities: Entity[]; members: Member[]; onClose: () => void; onCreate: (value: typeof emptyTask & { confirmUnavailable?: boolean }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState({ ...emptyTask, column });
  const [expanded, setExpanded] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    void onCreate({ ...value, confirmUnavailable: error === 'confirm_unavailable' }).catch((e: Error) => setError(e.message)).finally(() => setBusy(false));
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }} title={t('newTask')}>
    <p className="muted small">{t('captureHint')}</p>
    <form onSubmit={submit}><fieldset disabled={busy}>
      <label className="sr-only" htmlFor="capture-title">{t('taskTitle')}</label><input id="capture-title" autoFocus required maxLength={300} placeholder={t('taskTitle')} value={value.title} onChange={e => setValue({ ...value, title: e.target.value })} />
      <p className="capture-context small muted">{t('column')} · {t('column_' + column)}</p>
      {error && <p role="alert" className="alert error">{t(error)}</p>}
      {expanded && <TaskFields value={value} onChange={changes => setValue({ ...value, ...changes })} entities={entities} members={members} timezone={timezone} />}
      <div className="button-row"><button className="primary" type="submit"><Plus size={18} />{t(error === 'confirm_unavailable' ? 'startAnyway' : 'addTask')}</button><button type="button" className="quiet" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{t('captureMore')}</button></div>
    </fieldset></form>
  </Dialog>;
}
