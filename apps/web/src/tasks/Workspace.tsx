import { TaskDragSurface } from '../planning/TaskDragSurface.js';
import { QuickFilterBar } from '../planning/QuickFilterBar.js';
import { Search } from '../content/Search.js';
import { useHouseholdSync } from '../content/useHouseholdSync.js';
import { TemplateLibrary } from '../lifecycle/TemplateLibrary.js';
import { LifecycleLibrary } from '../lifecycle/LifecycleLibrary.js';
import { TaskBoard, MovableCard } from '../planning/TaskBoard.js';
import { PlanningLibrary, usePlanning } from '../planning/PlanningLibrary.js';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { House, LayoutGrid, MoreHorizontal, Plus, PanelLeftClose, PanelLeftOpen, Check, Flag, Clock3, Settings2, Shapes, ArrowLeft, Search as SearchIcon, Star, MapPin, ListChecks } from 'lucide-react';
import { columns, type Account, type Task, type TaskChanges, type TaskColumn, type Entity, type ViewDefinition } from '@tendly/shared';
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
  const connected = useHouseholdSync(id);
  const [searching, setSearching] = useState(false);
  const [seriesId, setSeriesId] = useState<string | null>(null);
  const [lifecycleUndo, setLifecycleUndo] = useState<{ id: string; version: number; action: 'restore' | 'unarchive' } | null>(null);
  const [view, setView] = useState<'now' | 'board' | 'more' | 'library' | 'settings' | 'planning' | 'custom' | 'templates' | 'lifecycle'>(link ? 'settings' : 'now');
  const [collapsed, setCollapsed] = useState(true);
  const [column, setColumn] = useState<TaskColumn>('todo');
  const [captureEpic, setCaptureEpic] = useState<string | null>(null);
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
  useEffect(() => { setNotice(''); }, [view]);
  const entities = useQuery({ queryKey: ['planning', id, 'entities'], enabled: !!id, queryFn: () => result(api.GET('/api/v1/households/{householdId}/entities', { params: { path: { householdId: id } } })) });
  const members = useQuery({ queryKey: ['planning', id, 'members'], enabled: !!id, queryFn: () => result(api.GET('/api/v1/households/{id}/members', { params: { path: { id } } })) });
  const planning = usePlanning(id);
  const [customId, setCustomId] = useState('');
  const activeView = planning.data?.views.find(v => view === 'custom' ? v.id === customId : v.builtin === view);
  const personal = activeView && planning.data?.personal[activeView.id];
  const presentation = activeView?.definition.presentation ?? (view === 'now' ? 'list' : 'board');
  async function updatePersonal(changes: Partial<NonNullable<typeof personal>>) {
    if (!activeView || !personal) return;
    try { await result(api.PUT('/api/v1/households/{householdId}/views/{id}/personal', { params: { path: { householdId: id, id: activeView.id } }, body: { ...personal, ...changes } })); await queries.invalidateQueries({ queryKey: ['planning', id] }); } catch (e) { setError((e as Error).message); }
  }
  const list = useInfiniteQuery<{ items: Task[]; nextOffset: number | null; missingCurrentPlace: boolean }>({
    queryKey: ['planning', id, 'tasks', activeView?.id, activeView?.version, personal?.version], enabled: !!id && !!activeView,
    initialPageParam: 0, getNextPageParam: (last: { items: Task[]; nextOffset: number | null }) => last.nextOffset ?? undefined,
    queryFn: ({ pageParam }) => result(api.GET('/api/v1/households/{householdId}/views/{id}/tasks', { params: { path: { householdId: id, id: activeView!.id }, query: { offset: Number(pageParam), limit: 100 } } })),
    refetchInterval: 30_000,
  });
  const detail = useQuery({ queryKey: ['planning', id, 'task', selected], enabled: !!id && !!selected, queryFn: () => result(api.GET('/api/v1/households/{householdId}/tasks/{id}', { params: { path: { householdId: id, id: selected! } } })) });
  const items = list.data?.pages.flatMap(page => page.items) ?? [];
  async function move(taskId: string, changes: TaskChanges) {
    const task = items.find(t => t.id === taskId);
    if (!task || mutationBusy.current) return;
    mutationBusy.current = true; setError('');
    try { return await change(task, changes); }
    catch (e) {
      if (e instanceof EditFailure && ['confirm_unavailable', 'confirm_descendants'].includes(e.message) && window.confirm(t(e.message))) {
        try { return await change(task, changes, true, true); } catch (failure) { setError((failure as Error).message); }
      } else setError((e as Error).message);
    } finally { mutationBusy.current = false; }
  }
  async function reorder(taskId: string, beforeId: string | null, updated?: Task) {
    const task = updated ?? items.find(t => t.id === taskId);
    if (!task) return;
    try { await saved(await result(api.POST('/api/v1/households/{householdId}/tasks/{id}/order', { params: { path: { householdId: id, id: taskId } }, body: { baseVersion: task.version, beforeId } }))); } catch (e) { setError((e as Error).message); }
  }
  function card(task: Task) {
    const siblings = items.filter(t => t.column === task.column && (!activeView?.definition.epicLanes || t.epicId === task.epicId)), index = siblings.findIndex(t => t.id === task.id);
    async function dropBefore(beforeId: string | null, movingId?: string) {
      const moving = items.find(t => t.id === movingId);
      if (presentation !== 'list' && moving && (moving.column !== task.column || activeView?.definition.epicLanes && moving.epicId !== task.epicId)) {
        const updated = await move(moving.id, { column: task.column, ...(activeView?.definition.epicLanes ? { epicId: task.epicId } : {}) });
        // Moving columns increments the version; order against that returned version.
        if (updated) await reorder(moving.id, beforeId, updated);
        return;
      }
      await reorder(movingId ?? task.id, beforeId);
    }
    return <MovableCard key={task.id} task={task} manual={activeView?.definition.sort === 'manual'} afterId={(presentation === 'list' ? items[items.findIndex(item => item.id === task.id) + 1] : siblings[index + 1])?.id ?? null} moveUp={() => { const before = siblings[index - 1]; if (before) void reorder(task.id, before.id); }} moveDown={() => { if (index < siblings.length - 1) void reorder(task.id, siblings[index + 2]?.id ?? null); }} reorder={(beforeId, movingId) => void dropBefore(beforeId, movingId)} reparent={(movingId, parentId) => { if (movingId && window.confirm(t('reparentHelp'))) void move(movingId, { parentId }); }} change={column => void move(task.id, { column })}><TaskCard task={task} entities={entities.data ?? []} members={members.data ?? []} properties={activeView?.definition.cardProperties} open={() => setSelected(task.id)} complete={() => void toggle(task)} /></MovableCard>;
  }
  async function saved(task: Task) {
    queries.setQueryData(['planning', id, 'task', task.id], task);
    await queries.invalidateQueries({ queryKey: ['planning', id] });
  }
  async function change(base: Task, changes: TaskChanges, confirmed = false, confirmDescendants = false) {
    const next = await patchTask(id, base, changes, confirmed, confirmDescendants);
    const inverse = Object.fromEntries(Object.keys(changes).map(key => [key, base.local[key as keyof typeof base.local]])) as TaskChanges;
    if (JSON.stringify(next.local.inherit) !== JSON.stringify(base.local.inherit)) inverse.inherit = base.local.inherit;
    if (changes.estimateMinutes !== undefined && next.size !== base.size) inverse.size = base.size;
    setHistory(old => [...old.slice(-19), { current: next, inverse, forward: changes }]); setRedo([]);
    await saved(next);
    return next;
  }
  async function toggle(task: Task, confirmed = false) {
    if (mutationBusy.current) return;
    mutationBusy.current = true; setError('');
    try { await change(task, { column: task.column === 'done' ? 'reopen' : 'done' }, confirmed, confirmed); setConfirmStart(null); setNotice('changed'); }
    catch (e) { if (e instanceof EditFailure && ['confirm_unavailable', 'confirm_descendants'].includes(e.message)) { setConfirmStart(task); return; } setError(e instanceof EditFailure && e.message === 'task_conflict' ? 'conflictTitle' : e instanceof Error ? e.message : 'operation_failed'); await list.refetch(); }
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
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && id && !document.querySelector('[role=dialog]')) { event.preventDefault(); setSearching(true); return; }
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable=true], [role=dialog]')) return;
      if (event.key.toLowerCase() === 'n' && !event.metaKey && !event.ctrlKey && !event.altKey && id) { event.preventDefault(); setCapture('someday'); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); void undo(event.shiftKey); }
    }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  });
  const navigation = [{ key: 'now', icon: House }, { key: 'board', icon: LayoutGrid }, { key: 'more', icon: MoreHorizontal }] as const;
  function switchHousehold(value: string) { setHouseholdId(value); setSelected(null); setCapture(null); setHistory([]); setRedo([]); setLifecycleUndo(null); setSeriesId(null); setNotice(''); setError(''); }
  return <div className={'workspace ' + (collapsed ? 'nav-collapsed' : '')}>
    <aside className="workspace-nav">
      <div className="brand"><House size={23} /><span>Tendly</span></div>
      {account.households.length > 1 ? <label className="household-switch"><span className="sr-only">{t('household')}</span><select value={id} onChange={e => switchHousehold(e.target.value)}>{account.households.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label> : <p className="nav-household muted">{household?.name}</p>}
      <nav aria-label="Tendly">{navigation.map(({ key, icon: Icon }) => <button key={key} aria-label={t(key)} title={t(key)} aria-current={view === key || key === 'more' && ['library', 'settings'].includes(view) ? 'page' : undefined} onClick={() => setView(key)}><Icon size={21} /><span>{t(key)}</span></button>)}</nav>
      <nav aria-label={t('favoriteViews')}>{planning.data?.views.filter(v => !v.builtin && planning.data.personal[v.id]?.favorite).map(v => <button key={v.id} aria-label={v.name} title={v.name} aria-current={customId === v.id && view === 'custom' ? 'page' : undefined} onClick={() => { setCustomId(v.id); setView('custom'); }}><EntityIcon name={v.icon} size={21} /><span>{v.name}</span></button>)}</nav>
      <button className="nav-collapse quiet" aria-label={t(collapsed ? 'expandNav' : 'collapseNav')} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}</button>
      <div className="nav-person"><span className="avatar">{account.avatar ? <img src={account.avatar} alt="" /> : account.name.slice(0, 1).toUpperCase()}</span><span>{account.name}</span></div>
    </aside>
    <main className={"workspace-main " + (['now', 'board', 'custom'].includes(view) ? 'task-workspace' : '')} tabIndex={-1}>
      {id && !['now', 'board', 'custom'].includes(view) && <div className="workspace-utilities">{view !== 'more' && <button className="quiet" onClick={() => setView('more')}><ArrowLeft size={17} />{t('back')}</button>}<button className="utility-search" onClick={() => setSearching(true)}>{t('search')}</button>{!connected && <small role="status">{t('reconnecting')}</small>}</div>}
      {account.households.length > 1 && <label className="mobile-household-switch">{t('household')}<select value={id} onChange={e => switchHousehold(e.target.value)}>{account.households.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label>}
      {['now', 'board', 'custom'].includes(view) && <>
        <header className="board-toolbar">
          <div className="board-context"><h1>{activeView?.builtin ? t(activeView.builtin) : activeView?.name ?? t(view)}</h1><span>{household?.name}</span></div>
          {activeView && <div className="view-toolbar"><QuickFilterBar onManage={() => setView('planning')} householdId={id} filters={activeView.definition.quickFilters.flatMap(filterId => planning.data?.filters.filter(f => f.id === filterId) ?? [])} active={personal?.activeFilters ?? []} onChange={activeFilters => void updatePersonal({ activeFilters })} entities={entities.data ?? []} members={members.data ?? []} /><label className="current-place"><MapPin size={16} aria-hidden="true" /><span className="sr-only">{t('currentPlace')}</span><select value={personal?.currentPlace ?? ''} onChange={e => void updatePersonal({ currentPlace: e.target.value || null })}><option value="">{t('none')}</option>{entities.data?.filter(e => e.kind === 'place').map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label><button className="quiet icon-button" aria-label={t('favorite')} aria-pressed={personal?.favorite ?? false} onClick={() => void updatePersonal({ favorite: !personal?.favorite })}><Star size={17} fill={personal?.favorite ? 'currentColor' : 'none'} /></button></div>}
          <div className="board-actions"><button className="quiet icon-button" aria-label={t('search')} onClick={() => setSearching(true)}><SearchIcon size={19} /></button><button className="desktop-capture primary" onClick={() => setCapture('someday')} disabled={!id}><Plus size={18} />{t('newTask')}</button></div>
        </header>
        {!connected && <small role="status">{t('reconnecting')}</small>}
        {!household && <div className="empty-state"><p>{t('noMembership')}</p><button onClick={() => setView('settings')}>{t('accountSettings')}</button></div>}
        {error && <p role="alert" className="alert error">{t(error)}</p>}
        {list.data?.pages[0]?.missingCurrentPlace && <p className="alert">{t('chooseCurrentPlace')}</p>}
        {list.isError && <div role="alert" className="alert error">{t('network_error')} <button onClick={() => void list.refetch()}>{t('retry')}</button></div>}

        {(list.isPending && id) ? <p role="status">{t('loading')}</p> : presentation === 'list' ? <TaskDragSurface className="now-list" manual={activeView?.definition.sort === 'manual'}>
          {!items.length && id && <div className="empty-state"><div className="empty-symbol"><House size={30} /></div><h2>{t('noTasks')}</h2><p>{t(personal?.activeFilters.length ? 'noFilterMatches' : 'noNowTasks')}</p><button onClick={() => setView('board')}>{t('board')}</button></div>}
          {items.map(card)}
        </TaskDragSurface> : <>

          <label className="mobile-column-select">{t('column')}<select value={column} onChange={e => setColumn(e.target.value as TaskColumn)}>{columns.map(c => <option key={c} value={c}>{t('column_' + c)}</option>)}</select></label>
          <div className="board-gestures" onTouchStart={e => { swipeStart.current = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY }; }} onTouchEnd={e => {
            const dx = e.changedTouches[0]!.clientX - swipeStart.current.x, dy = e.changedTouches[0]!.clientY - swipeStart.current.y;
            if (Math.abs(dx) > 70 && Math.abs(dy) < 50) { const next = columns[columns.indexOf(column) + (dx < 0 ? 1 : -1)]; if (next) setColumn(next); lastSwipe.current = Date.now(); }
          }} onClickCapture={e => { if (Date.now() - lastSwipe.current < 350) { e.preventDefault(); e.stopPropagation(); } }}>
            <TaskBoard manual={activeView?.definition.sort === 'manual'} items={items} entities={entities.data ?? []} column={column} lanes={activeView?.definition.epicLanes ?? false} empty={activeView?.definition.showEmptyLanes ?? false} renderCard={card} capture={(column, epicId) => { setCaptureEpic(epicId ?? null); setCapture(column); }} drop={(id, changes) => { void (async () => { const updated = await move(id, changes); if (updated && activeView?.definition.sort === 'manual') await reorder(id, null, updated); })(); }} />
          </div>
        </>}
        {list.hasNextPage && <button disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>{t('loadMore')}</button>}
      </>}
      <div className="page-layout" hidden={['now', 'board', 'custom'].includes(view)}>
      {view === 'templates' && household && <TemplateLibrary initialId={seriesId} householdId={id} entities={entities.data ?? []} members={members.data ?? []} timezone={household.timezone} onOpen={task => { void saved(task); setSelected(task.id); }} />}
      {view === 'lifecycle' && household && <LifecycleLibrary householdId={id} admin={household.role === 'admin'} onOpen={setSelected} />}
      {view === 'planning' && <PlanningLibrary householdId={id} entities={entities.data ?? []} members={members.data ?? []} onOpenView={viewId => { setCustomId(viewId); setView('custom'); }} />}
      {view === 'more' && <><header className="page-heading"><h1>{t('more')}</h1></header><div className="more-links">{id && <><button onClick={() => setView('templates')}>{t('templates')}</button><button onClick={() => setView('lifecycle')}>{t('archiveAndTrash')}</button></>}{id && <button onClick={() => setView('planning')}><LayoutGrid size={24} /><span>{t('viewsAndFilters')}</span></button>}{planning.data?.views.filter(v => !v.builtin && planning.data.personal[v.id]?.favorite).map(v => <button key={v.id} onClick={() => { setCustomId(v.id); setView('custom'); }}><EntityIcon name={v.icon} /><span>{v.name}</span></button>)}{id && <button onClick={() => setView('library')}><Shapes size={24} /><span>{t('library')}<small>{t('epics')} · {t('places')} · {t('resources')} · {t('tags')}</small></span></button>}<button onClick={() => setView('settings')}><Settings2 size={24} /><span>{t('accountSettings')}</span></button></div></>}
      {view === 'library' && household && <><Library householdId={id} entities={entities.data ?? []} admin={household.role === 'admin'} /></>}
      {view === 'settings' && <><Settings key={id} embedded activeHouseholdId={id} account={account} refresh={refresh} link={link} clearLink={clearLink} useInvitation={useInvitation} /></>}
      </div>
    </main>
    <nav className="mobile-nav" aria-label="Tendly">{navigation.map(({ key, icon: Icon }) => <button key={key} aria-current={view === key || key === 'more' && ['library', 'settings'].includes(view) ? 'page' : undefined} onClick={() => setView(key)}><Icon size={22} /><span>{t(key)}</span></button>)}<button className="capture-fab" aria-label={t('newTask')} disabled={!id} onClick={() => setCapture('someday')}><Plus size={29} /></button></nav>
    {lifecycleUndo && <div className="task-toast" role="status"><span>{t('changed')}</span><button onClick={() => { void result(api.POST('/api/v1/households/{householdId}/tasks/{id}/lifecycle', { params: { path: { householdId: id, id: lifecycleUndo.id } }, body: { baseVersion: lifecycleUndo.version, action: lifecycleUndo.action, confirmed: false } })).then(async () => { setLifecycleUndo(null); await queries.invalidateQueries({ queryKey: ['planning', id] }); }).catch(() => setError('undoConflict')); }}>{t('undo')}</button><button onClick={() => setLifecycleUndo(null)}>{t('close')}</button></div>}
    {notice && <div className="task-toast" role="status"><span>{t(notice)}</span>{notice === 'created' && createdId && <button onClick={() => { setSelected(createdId); setNotice(''); }}>{t('viewTask')}</button>}{history.length > 0 && <button onClick={() => void undo()}>{t('undo')}</button>}<button className="quiet" aria-label={t('close')} onClick={() => setNotice('')}>×</button></div>}
    {searching && <Search householdId={id} entities={entities.data ?? []} members={members.data ?? []} onOpen={taskId => { setSearching(false); setSelected(taskId); }} onClose={() => setSearching(false)} onEntities={() => { setSearching(false); setView('library'); }} />}
    {capture && household && <Capture epicId={captureEpic} column={capture} timezone={household.timezone} entities={entities.data ?? []} members={members.data ?? []} onClose={() => { setCapture(null); setCaptureEpic(null); }} onCreate={async value => {
      const task = await result(api.POST('/api/v1/households/{householdId}/tasks', { params: { path: { householdId: id } }, body: value }));
      await saved(task); setCapture(null); setCaptureEpic(null); setCreatedId(task.id); setNotice('created');
    }} />}
    {confirmStart && <Dialog open onOpenChange={open => { if (!open) setConfirmStart(null); }} title={t(confirmStart.column === 'done' ? 'reopen' : 'complete')}><p>{t(confirmStart.column === 'done' ? 'confirm_unavailable' : 'confirm_descendants')}</p><button className="primary" onClick={() => void toggle(confirmStart, true)}>{t(confirmStart.column === 'done' ? 'startAnyway' : 'completeAnyway')}</button></Dialog>}
    {selected && detail.isError && <Dialog open onOpenChange={open => { if (!open) setSelected(null); }} title={t('taskDetails')}><p role="alert">{t('task_not_found')}</p><button onClick={() => void detail.refetch()}>{t('retry')}</button></Dialog>}
    {selected && detail.data && household && <TaskEditor onSeries={id => { setSelected(null); setSeriesId(id); setView('templates'); }} onLifecycle={setLifecycleUndo} actorId={account.id} householdId={id} onOpen={setSelected} onCreated={task => { void saved(task); }} onToggle={async childId => {
      const child = await result(api.GET('/api/v1/households/{householdId}/tasks/{id}', { params: { path: { householdId: id, id: childId } } }));
      try { await change(child, { column: child.column === 'done' ? 'reopen' : 'done' }); }
      catch (error) { if (error instanceof EditFailure && ['confirm_unavailable', 'confirm_descendants'].includes(error.message)) setConfirmStart(child); else throw error; }
    }} key={detail.data.id} task={detail.data} entities={entities.data ?? []} members={members.data ?? []} timezone={household.timezone} onSave={change} onRefresh={task => { void saved(task); }} onClose={() => setSelected(null)} />}
  </div>;
}
function TaskCard({ task, entities, members, open, complete, properties }: { task: Task; entities: Entity[]; members: Member[]; open: () => void; complete: () => void; properties?: ViewDefinition['cardProperties'] | undefined }) {
  const { t, i18n } = useTranslation();
  const epic = entities.find(e => e.id === task.epicId);
  return <article className={'task-card ' + (epic ? 'has-epic ' : '') + (task.column === 'done' ? 'completed' : '')} style={epicStyle(epic)}>
    <button className="card-open" draggable onClick={open} aria-label={task.title}>
      {epic && <span className="card-icon"><EntityIcon name={epic.icon} size={26} /></span>}
      <span className="card-content">{epic && <span className="card-epic">{epic.name}</span>}<strong>{task.title}</strong><span className="card-metadata">
        {properties?.includes('size') && task.size && <span className="size-chip">{task.size}</span>}
        {properties?.includes('estimate') && task.estimateMinutes !== null && <small>{task.estimateMinutes} min</small>}
        {properties?.includes('progress') && task.progress.total > 0 && <span aria-label={t('subtaskProgress', task.progress)}><ListChecks size={13} />{task.progress.done}/{task.progress.total}</span>}
        {task.parentId && <span title={task.ancestors.map(a => a.title).join(' › ')}>↳ {task.ancestors.at(-1)?.title}</span>}
        {properties?.includes('priority') && task.high && <span title={t('high')}><Flag size={13} aria-label={t('high')} /></span>}
        {properties?.includes('deadline') && task.deadlineDate && <span className={task.overdue ? 'deadline overdue' : 'deadline'}>{task.overdue && <span>{t('overdue')} · </span>}{new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(task.deadlineDate + 'T12:00:00Z'))}</span>}
        {!task.available && <span title={t('unavailable')}><Clock3 size={13} />{t('unavailable')}</span>}
        {properties?.includes('assignees') && task.assignees.map(id => <span className="card-avatar" key={id} title={members.find(m => m.id === id)?.name}>{members.find(m => m.id === id)?.name.slice(0, 1).toUpperCase()}</span>)}
      {(['places', 'resources', 'tags'] as const).filter(p => properties?.includes(p)).flatMap(p => task[p].map(id => <span key={id}>{entities.find(e => e.id === id)?.name}</span>))}</span></span>
    </button>
    <button className="card-complete" aria-label={t(task.column === 'done' ? 'reopen' : 'complete') + ' · ' + task.title} aria-pressed={task.column === 'done'} onClick={complete}><span>{task.column === 'done' && <Check size={15} />}</span></button>
  </article>;
}
function Capture({ column, epicId, timezone, entities, members, onClose, onCreate }: {
  column: TaskColumn; epicId: string | null; timezone: string; entities: Entity[]; members: Member[]; onClose: () => void; onCreate: (value: typeof emptyTask & { subtasks?: string[]; confirmUnavailable?: boolean; confirmDescendants?: boolean }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState({ ...emptyTask, column, epicId });
  const [children, setChildren] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    void onCreate({ ...value, subtasks: children.filter(title => title.trim()), confirmUnavailable: error === 'confirm_unavailable', confirmDescendants: error === 'confirm_descendants' }).catch((e: Error) => setError(e.message)).finally(() => setBusy(false));
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }} title={t('newTask')}>
    <p className="muted small">{t('captureHint')}</p>
    <form onSubmit={submit}><fieldset disabled={busy}>
      <label className="sr-only" htmlFor="capture-title">{t('taskTitle')}</label><input id="capture-title" autoFocus required maxLength={300} placeholder={t('taskTitle')} value={value.title} onChange={e => setValue({ ...value, title: e.target.value })} />
      <p className="capture-context small muted">{t('column')} · {t('column_' + column)}</p>
      {error && <p role="alert" className="alert error">{t(error)}</p>}
      {expanded && <><TaskFields disabled={busy} value={value} onChange={changes => setValue({ ...value, ...changes })} entities={entities} members={members} timezone={timezone} /><fieldset><legend>{t('subtasks')}</legend>{children.map((title, index) => <label key={index}>{t('subtaskTitle')} {index + 1}<input value={title} maxLength={300} onChange={e => setChildren(children.map((v, i) => i === index ? e.target.value : v))} /></label>)}<button type="button" onClick={() => setChildren([...children, ''])}>{t('addSubtask')}</button></fieldset></>}
      <div className="button-row"><button className="primary" type="submit"><Plus size={18} />{t(error === 'confirm_unavailable' ? 'startAnyway' : error === 'confirm_descendants' ? 'completeAnyway' : 'addTask')}</button><button type="button" className="quiet" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{t('captureMore')}</button></div>
    </fieldset></form>
  </Dialog>;
}
