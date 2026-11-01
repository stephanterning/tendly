import { useViewCatalog, viewName } from '../views/api.js';
import { QuickBar } from '../views/QuickBar.js';
import { ViewLibrary } from '../views/Library.js';
import { TaskPresentation, type Move } from '../views/TaskPresentation.js';
import { Search } from '../content/Search.js';
import { useHouseholdEvents } from './useHouseholdEvents.js';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  House,
  LayoutGrid,
  MoreHorizontal,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
  Shapes,
  ArrowLeft,
} from 'lucide-react';
import {
  type Account,
  type Task,
  type TaskChanges,
  type TaskColumn,
  type Entity,
} from '@tendly/shared';
import { api, result } from '../accounts/api.js';
import { Settings } from '../accounts/Settings.js';
import type { EntryLink } from '../accounts/Auth.js';
import { Dialog } from '../components/ui/dialog.js';
import { EntityIcon } from './identity.js';
import { TaskEditor } from './TaskEditor.js';
import { TaskFields, emptyTask, type Member } from './TaskFields.js';
import { patchTask, EditFailure, defined } from './api.js';
import { Library } from './Library.js';

type HistoryEntry = { current: Task; inverse: TaskChanges; forward: TaskChanges };
export function Workspace({
  account,
  refresh,
  link,
  clearLink,
  useInvitation,
}: {
  account: Account;
  refresh: () => Promise<void>;
  link: EntryLink;
  clearLink: () => void;
  useInvitation: (code: string) => void;
}) {
  const { t } = useTranslation();
  const queries = useQueryClient();
  const [householdId, setHouseholdId] = useState(account.households[0]?.id ?? '');
  const household = account.households.find((h) => h.id === householdId) ?? account.households[0];
  const id = household?.id ?? '';
  useHouseholdEvents(id);
  const [view, setView] = useState<
    'now' | 'board' | 'more' | 'library' | 'settings' | 'search' | 'custom' | 'views'
  >(link ? 'settings' : 'now');
  const [collapsed, setCollapsed] = useState(false);
  const [customViewId, setCustomViewId] = useState<string | null>(null);
  const catalog = useViewCatalog(id);
  const activeView = catalog.data?.views.find(
    (v) => !v.deleted && (view === 'custom' ? v.id === customViewId : v.builtin === view),
  );
  const [captureEpic, setCaptureEpic] = useState<string | null>(null);
  const [moveUndo, setMoveUndo] = useState<{
    task: Task;
    orderVersion: number;
    inverse: Move;
  } | null>(null);
  const [capture, setCapture] = useState<TaskColumn | null>(null);
  const [confirmStart, setConfirmStart] = useState<Task | null>(null);
  const [librarySelection, setLibrarySelection] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [notice, setNotice] = useState(''),
    [error, setError] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [redo, setRedo] = useState<HistoryEntry[]>([]);
  const mutationBusy = useRef(false);
  useEffect(() => {
    if (link) setView('settings');
  }, [link]);
  const entities = useQuery({
    queryKey: ['planning', id, 'entities'],
    enabled: !!id,
    queryFn: () =>
      result(
        api.GET('/api/v1/households/{householdId}/entities', {
          params: { path: { householdId: id } },
        }),
      ),
  });
  const members = useQuery({
    queryKey: ['planning', id, 'members'],
    enabled: !!id,
    queryFn: () => result(api.GET('/api/v1/households/{id}/members', { params: { path: { id } } })),
  });
  const list = useInfiniteQuery<{
    items: Task[];
    nextOffset: number | null;
    count: number;
    orderVersion: number;
    warnings: string[];
  }>({
    queryKey: ['planning', id, 'tasks', activeView?.id],
    enabled: !!id && !!activeView,
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    queryFn: ({ pageParam }) =>
      result(
        api.POST('/api/v1/households/{householdId}/task-query', {
          params: { path: { householdId: id } },
          body: { viewId: activeView!.id, offset: Number(pageParam), limit: 100 },
        }),
      ),
    refetchInterval: 30_000,
  });
  const detail = useQuery({
    queryKey: ['planning', id, 'task', selected],
    enabled: !!id && !!selected,
    queryFn: () =>
      result(
        api.GET('/api/v1/households/{householdId}/tasks/{id}', {
          params: { path: { householdId: id, id: selected! } },
        }),
      ),
  });
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  async function saved(task: Task) {
    queries.setQueryData(['planning', id, 'task', task.id], task);
    await queries.invalidateQueries({ queryKey: ['planning', id, 'tasks'] });
  }
  async function change(base: Task, changes: TaskChanges, confirmed = false) {
    const next = await patchTask(id, base, changes, confirmed);
    setMoveUndo(null);
    const inverse = Object.fromEntries(
      Object.keys(changes).map((key) => [key, base[key as keyof Task]]),
    ) as TaskChanges;
    if (changes.estimateMinutes !== undefined && next.size !== base.size) inverse.size = base.size;
    setHistory((old) => [...old.slice(-19), { current: next, inverse, forward: changes }]);
    setRedo([]);
    await saved(next);
    return next;
  }
  async function toggle(task: Task, confirmed = false) {
    if (mutationBusy.current) return;
    mutationBusy.current = true;
    setError('');
    try {
      await change(task, { column: task.column === 'done' ? 'reopen' : 'done' }, confirmed);
      setConfirmStart(null);
      setNotice('changed');
    } catch (e) {
      if (e instanceof EditFailure && e.message === 'confirm_unavailable') {
        setConfirmStart(task);
        return;
      }
      setError(
        e instanceof EditFailure && e.message === 'task_conflict'
          ? 'conflictTitle'
          : e instanceof Error
            ? e.message
            : 'operation_failed',
      );
      await list.refetch();
    } finally {
      mutationBusy.current = false;
    }
  }
  async function move(task: Task, changes: Move) {
    if (mutationBusy.current) return;
    mutationBusy.current = true;
    setError('');
    try {
      let next;
      const request = (confirmed = false) =>
        result(
          api.POST('/api/v1/households/{householdId}/tasks/{id}/move', {
            params: { path: { householdId: id, id: task.id } },
            body: defined({
              baseVersion: task.version,
              orderVersion: list.data?.pages[0]?.orderVersion ?? 0,
              ...changes,
              confirmUnavailable: confirmed,
            }),
          }),
        );
      try {
        next = await request();
      } catch (e) {
        if (
          e instanceof Error &&
          e.message === 'confirm_unavailable' &&
          window.confirm(t('confirm_unavailable'))
        )
          next = await request(true);
        else throw e;
      }
      const reordered = changes.beforeId !== undefined || changes.afterId !== undefined;
      setMoveUndo({
        task: next.task,
        orderVersion: next.orderVersion,
        inverse: {
          ...(reordered ? { beforeId: next.inverse.beforeId } : {}),
          ...(changes.column !== undefined ? { column: next.inverse.column } : {}),
          ...(changes.epicId !== undefined ? { epicId: next.inverse.epicId } : {}),
        },
      });
      setHistory([]);
      setRedo([]);
      setNotice('changed');
      await saved(next.task);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'operation_failed');
      await list.refetch();
      throw e;
    } finally {
      mutationBusy.current = false;
    }
  }
  async function undoMove() {
    if (!moveUndo || mutationBusy.current) return;
    mutationBusy.current = true;
    setError('');
    try {
      const next = await result(
        api.POST('/api/v1/households/{householdId}/tasks/{id}/move', {
          params: { path: { householdId: id, id: moveUndo.task.id } },
          body: defined({
            baseVersion: moveUndo.task.version,
            orderVersion: moveUndo.orderVersion,
            ...moveUndo.inverse,
          }),
        }),
      );
      setMoveUndo(null);
      setNotice('changed');
      await saved(next.task);
    } catch {
      setError('undoConflict');
    } finally {
      mutationBusy.current = false;
    }
  }
  async function undo(isRedo = false) {
    if (!isRedo && moveUndo) {
      await undoMove();
      return;
    }
    const entry = (isRedo ? redo : history).at(-1);
    if (!entry || mutationBusy.current) return;
    mutationBusy.current = true;
    setError('');
    try {
      const next = await patchTask(id, entry.current, isRedo ? entry.forward : entry.inverse);
      const nextEntry = { ...entry, current: next };
      const rebase = (item: HistoryEntry) =>
        item.current.id === next.id &&
        Object.keys(item.inverse).every(
          (key) =>
            JSON.stringify(item.current[key as keyof Task]) ===
            JSON.stringify(next[key as keyof Task]),
        )
          ? { ...item, current: next }
          : item;
      if (isRedo) {
        setRedo((old) => old.slice(0, -1).map(rebase));
        setHistory((old) => [...old.map(rebase), nextEntry]);
      } else {
        setHistory((old) => old.slice(0, -1).map(rebase));
        setRedo((old) => [...old.map(rebase), nextEntry]);
      }
      await saved(next);
      setNotice('changed');
    } catch {
      setError('undoConflict');
    } finally {
      mutationBusy.current = false;
    }
  }
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && id) {
        event.preventDefault();
        setView('search');
        return;
      }
      if (
        event.target instanceof Element &&
        event.target.closest('input, textarea, select, [contenteditable=true], [role=dialog]')
      )
        return;
      if (
        event.key.toLowerCase() === 'n' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        id
      ) {
        event.preventDefault();
        setCaptureEpic(null);
        setCapture('someday');
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        void undo(event.shiftKey);
      }
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  const navigation = [
    { key: 'now', icon: House },
    { key: 'board', icon: LayoutGrid },
    { key: 'more', icon: MoreHorizontal },
  ] as const;
  function switchHousehold(value: string) {
    setHouseholdId(value);
    setSelected(null);
    setLibrarySelection(null);
    setCapture(null);
    setHistory([]);
    setRedo([]);
    setNotice('');
    setError('');
    setMoveUndo(null);
    setCustomViewId(null);
    setView('now');
  }
  return (
    <div className={'workspace ' + (collapsed ? 'nav-collapsed' : '')}>
      <aside className="workspace-nav">
        <div className="brand">
          <House size={23} />
          <span>Tendly</span>
        </div>
        {account.households.length > 1 ? (
          <label className="household-switch">
            <span className="sr-only">{t('household')}</span>
            <select value={id} onChange={(e) => switchHousehold(e.target.value)}>
              {account.households.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="nav-household muted">{household?.name}</p>
        )}
        <nav aria-label="Tendly">
          {navigation.map(({ key, icon: Icon }) => (
            <button
              key={key}
              aria-label={t(key)}
              aria-current={
                view === key || (key === 'more' && ['library', 'settings'].includes(view))
                  ? 'page'
                  : undefined
              }
              onClick={() => setView(key)}
            >
              <Icon size={21} />
              <span>{t(key)}</span>
            </button>
          ))}
        </nav>
        <nav className="favorite-views" aria-label={t('views')}>
          {catalog.data?.views
            .filter((v) => !v.deleted && !v.builtin && catalog.data.states[v.id]?.favorite)
            .map((v) => (
              <button
                key={v.id}
                aria-current={activeView?.id === v.id ? 'page' : undefined}
                onClick={() => {
                  setCustomViewId(v.id);
                  setView('custom');
                }}
              >
                <EntityIcon name={v.icon} />
                <span>{viewName(v, t)}</span>
              </button>
            ))}
        </nav>
        {id && (
          <button className="quiet" onClick={() => setView('search')}>
            {t('search')} <small>⌘/Ctrl K</small>
          </button>
        )}
        <button
          className="nav-collapse quiet"
          aria-label={t(collapsed ? 'expandNav' : 'collapseNav')}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
        </button>
        <div className="nav-person">
          <span className="avatar">{account.name.slice(0, 1).toUpperCase()}</span>
          <span>{account.name}</span>
        </div>
      </aside>
      <main className="workspace-main" tabIndex={-1}>
        {(history.length > 0 || redo.length > 0 || moveUndo) && (
          <div className="button-row history-controls">
            <button disabled={!history.length && !moveUndo} onClick={() => void undo()}>
              {t('undo')}
            </button>
            <button disabled={!redo.length} onClick={() => void undo(true)}>
              {t('redo')}
            </button>
          </div>
        )}
        {account.households.length > 1 && (
          <label className="mobile-household-switch">
            {t('household')}
            <select value={id} onChange={(e) => switchHousehold(e.target.value)}>
              {account.households.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {['now', 'board', 'custom'].includes(view) && (
          <>
            <header className="page-heading">
              <div>
                <p className="eyebrow">{household?.name ?? 'Tendly'}</p>
                <h1>{activeView ? viewName(activeView, t) : t(view)}</h1>
                {view === 'now' && <p className="muted">{t('todayFocus')}</p>}
              </div>
              <button
                className="desktop-capture primary"
                onClick={() => {
                  setCaptureEpic(null);
                  setCapture('someday');
                }}
                disabled={!id}
              >
                <Plus size={19} />
                {t('newTask')}
              </button>
            </header>
            {!household && (
              <div className="empty-state">
                <p>{t('noMembership')}</p>
                <button onClick={() => setView('settings')}>{t('accountSettings')}</button>
              </div>
            )}
            {error && (
              <p role="alert" className="alert error">
                {t(error)}
              </p>
            )}
            {list.isError && (
              <div role="alert" className="alert error">
                {t('network_error')}{' '}
                <button onClick={() => void list.refetch()}>{t('retry')}</button>
              </div>
            )}
            {catalog.isError && (
              <p role="alert">
                {t('network_error')}{' '}
                <button onClick={() => void catalog.refetch()}>{t('retry')}</button>
              </p>
            )}
            {catalog.data && activeView && (
              <QuickBar
                key={activeView.id}
                householdId={id}
                view={activeView}
                catalog={catalog.data}
                entities={entities.data ?? []}
                members={members.data ?? []}
              />
            )}
            {list.data?.pages[0]?.warnings.map((w) => (
              <p key={w} role="status">
                {t(w)}
              </p>
            ))}
            {list.isPending && activeView ? (
              <p role="status">{t('loading')}</p>
            ) : (
              activeView && (
                <TaskPresentation
                  items={items}
                  view={activeView}
                  entities={entities.data ?? []}
                  members={members.data ?? []}
                  open={(task) => setSelected(task.id)}
                  complete={(task) => void toggle(task)}
                  create={(c, epic) => {
                    setCaptureEpic(epic ?? null);
                    setCapture(c);
                  }}
                  move={move}
                />
              )
            )}
            {view === 'custom' && !activeView && !catalog.isPending && (
              <p role="alert">
                {t('view_not_found')} <button onClick={() => setView('views')}>{t('views')}</button>
              </p>
            )}
            {list.hasNextPage && (
              <button disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
                {t('loadMore')}
              </button>
            )}
          </>
        )}
        {view === 'more' && (
          <>
            <header className="page-heading">
              <h1>{t('more')}</h1>
            </header>
            <div className="more-links">
              {catalog.data?.views
                .filter((v) => !v.deleted && !v.builtin && catalog.data.states[v.id]?.favorite)
                .map((v) => (
                  <button
                    key={v.id}
                    onClick={() => {
                      setCustomViewId(v.id);
                      setView('custom');
                    }}
                  >
                    <EntityIcon name={v.icon} />
                    <span>{viewName(v, t)}</span>
                  </button>
                ))}
              {id && (
                <button onClick={() => setView('views')}>
                  <LayoutGrid />
                  <span>{t('viewLibrary')}</span>
                </button>
              )}
              {id && <button onClick={() => setView('search')}>{t('search')}</button>}
              {id && (
                <button onClick={() => setView('library')}>
                  <Shapes size={24} />
                  <span>
                    {t('library')}
                    <small>
                      {t('epics')} · {t('places')} · {t('resources')} · {t('tags')}
                    </small>
                  </span>
                </button>
              )}
              <button onClick={() => setView('settings')}>
                <Settings2 size={24} />
                <span>{t('accountSettings')}</span>
              </button>
            </div>
          </>
        )}
        {view === 'views' && catalog.data && (
          <ViewLibrary
            householdId={id}
            catalog={catalog.data}
            entities={entities.data ?? []}
            members={members.data ?? []}
            onOpen={(viewId) => {
              setCustomViewId(viewId);
              setView('custom');
            }}
          />
        )}
        {view === 'search' && id && (
          <Search
            householdId={id}
            openTask={setSelected}
            openLibrary={(entityId) => {
              setLibrarySelection(entityId);
              setView('library');
            }}
          />
        )}
        {view === 'library' && household && (
          <>
            <button className="quiet" onClick={() => setView('more')}>
              <ArrowLeft size={17} />
              {t('back')}
            </button>
            <Library
              initialEntityId={librarySelection}
              householdId={id}
              entities={entities.data ?? []}
              admin={household.role === 'admin'}
            />
          </>
        )}
        {view === 'settings' && (
          <>
            <button className="quiet" onClick={() => setView('more')}>
              <ArrowLeft size={17} />
              {t('back')}
            </button>
            <Settings
              key={id}
              embedded
              activeHouseholdId={id}
              account={account}
              refresh={refresh}
              link={link}
              clearLink={clearLink}
              useInvitation={useInvitation}
            />
          </>
        )}
      </main>
      <nav className="mobile-nav" aria-label="Tendly">
        {navigation.map(({ key, icon: Icon }) => (
          <button
            key={key}
            aria-current={
              view === key || (key === 'more' && ['library', 'settings'].includes(view))
                ? 'page'
                : undefined
            }
            onClick={() => setView(key)}
          >
            <Icon size={22} />
            <span>{t(key)}</span>
          </button>
        ))}
        <button
          className="capture-fab"
          aria-label={t('newTask')}
          disabled={!id}
          onClick={() => {
            setCaptureEpic(null);
            setCapture('someday');
          }}
        >
          <Plus size={29} />
        </button>
      </nav>
      {notice && (
        <div className="task-toast" role="status">
          <span>{t(notice)}</span>
          {notice === 'created' && createdId && (
            <button
              onClick={() => {
                setSelected(createdId);
                setNotice('');
              }}
            >
              {t('viewTask')}
            </button>
          )}
          {(history.length > 0 || moveUndo) && (
            <button onClick={() => void undo()}>{t('undo')}</button>
          )}
          <button className="quiet" aria-label={t('close')} onClick={() => setNotice('')}>
            ×
          </button>
        </div>
      )}
      {capture && household && (
        <Capture
          epicId={captureEpic}
          column={capture}
          timezone={household.timezone}
          entities={entities.data ?? []}
          members={members.data ?? []}
          onClose={() => setCapture(null)}
          onCreate={async (value) => {
            const task = await result(
              api.POST('/api/v1/households/{householdId}/tasks', {
                params: { path: { householdId: id } },
                body: defined(value),
              }),
            );
            await saved(task);
            setCapture(null);
            setCreatedId(task.id);
            setNotice('created');
          }}
        />
      )}
      {confirmStart && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirmStart(null);
          }}
          title={t('reopen')}
        >
          <p>{t('confirm_unavailable')}</p>
          <button className="primary" onClick={() => void toggle(confirmStart, true)}>
            {t('startAnyway')}
          </button>
        </Dialog>
      )}
      {selected && detail.isError && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
          title={t('taskDetails')}
        >
          <p role="alert">{t('task_not_found')}</p>
          <button onClick={() => void detail.refetch()}>{t('retry')}</button>
        </Dialog>
      )}
      {selected && detail.data && household && (
        <TaskEditor
          userId={account.id}
          key={detail.data.id}
          task={detail.data}
          entities={entities.data ?? []}
          members={members.data ?? []}
          timezone={household.timezone}
          onSave={change}
          onRefresh={(task) => {
            void saved(task);
          }}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
function Capture({
  epicId,
  column,
  timezone,
  entities,
  members,
  onClose,
  onCreate,
}: {
  epicId: string | null;
  column: TaskColumn;
  timezone: string;
  entities: Entity[];
  members: Member[];
  onClose: () => void;
  onCreate: (value: typeof emptyTask & { confirmUnavailable?: boolean }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState({ ...emptyTask, column, epicId });
  const [contentValid, setContentValid] = useState(true);
  const [expanded, setExpanded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!contentValid) return;
    setBusy(true);
    void onCreate({ ...value, confirmUnavailable: error === 'confirm_unavailable' })
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title={t('newTask')}
    >
      <p className="muted small">{t('captureHint')}</p>
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          <label className="sr-only" htmlFor="capture-title">
            {t('taskTitle')}
          </label>
          <input
            id="capture-title"
            autoFocus
            required
            maxLength={300}
            placeholder={t('taskTitle')}
            value={value.title}
            onChange={(e) => setValue({ ...value, title: e.target.value })}
          />
          <p className="capture-context small muted">
            {t('column')} · {t('column_' + column)}
          </p>
          {error && (
            <p role="alert" className="alert error">
              {t(error)}
            </p>
          )}
          {expanded && (
            <TaskFields
              onValidityChange={setContentValid}
              value={value}
              onChange={(changes) => setValue({ ...value, ...changes })}
              entities={entities}
              members={members}
              timezone={timezone}
            />
          )}
          <div className="button-row">
            <button className="primary" type="submit">
              <Plus size={18} />
              {t(error === 'confirm_unavailable' ? 'startAnyway' : 'addTask')}
            </button>
            <button
              type="button"
              className="quiet"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {t('captureMore')}
            </button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
