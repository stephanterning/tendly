import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Flag, Clock3, Plus, GripVertical } from 'lucide-react';
import { columns, type Task, type Entity, type SavedView, type TaskColumn } from '@tendly/shared';
import type { Member } from '../tasks/TaskFields.js';
import { EntityIcon, epicStyle } from '../tasks/identity.js';
import { Dialog } from '../components/ui/dialog.js';

type BoardColumn = TaskColumn | 'future';
const futureColumns = new Set<TaskColumn>(['someday', 'within_year', 'within_month']);
const groupedColumns = ['future', ...columns.filter((column) => !futureColumns.has(column))] as const;
const taskColumnFor = (column: BoardColumn): TaskColumn => column === 'future' ? 'someday' : column;

export type Move = {
  beforeId?: string | null;
  afterId?: string | null;
  column?: TaskColumn;
  epicId?: string | null;
  confirmUnavailable?: boolean;
};
export function TaskPresentation({
  items,
  view,
  entities,
  members,
  open,
  taskHref,
  column, setColumn,
  splitFutureColumns,
  complete,
  create,
  move,
}: {
  items: Task[];
  view: SavedView;
  entities: Entity[];
  members: Member[];
  open: (task: Task) => void;
  taskHref: (task: Task) => string;
  column: TaskColumn; setColumn: (column: TaskColumn) => void;
  splitFutureColumns: boolean;
  complete: (task: Task) => void;
  create: (column: TaskColumn, epicId?: string | null) => void;
  move: (task: Task, changes: Move) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [moving, setMoving] = useState<Task | null>(null);
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 1024px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1024px)'),
      update = () => setMobile(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const dragged = useRef<Task | null>(null),
    swipe = useRef({ x: 0, y: 0 }),
    lastSwipe = useRef(0);
  const [dropTarget, setDropTarget] = useState('');
  const boardColumns: readonly BoardColumn[] = splitFutureColumns ? columns : groupedColumns;
  const boardColumnFor = (column: TaskColumn): BoardColumn =>
    !splitFutureColumns && futureColumns.has(column) ? 'future' : column;
  const activeColumn = boardColumnFor(column);
  const drop = (event: React.DragEvent, changes: Move, destination?: BoardColumn) => {
    event.preventDefault();
    event.stopPropagation();
    setDropTarget('');
    if (dragged.current) {
      const task = dragged.current;
      dragged.current = null;
      // Reordering within Future must preserve the card's planning horizon.
      const column = destination !== undefined && (destination !== 'future' || !futureColumns.has(task.column))
        ? taskColumnFor(destination)
        : undefined;
      if (column !== undefined || Object.keys(changes).length > 0)
        void move(task, { ...changes, ...(column !== undefined ? { column } : {}) }).catch(() => {});
    }
  };
  const droppable = (target: string, changes: Move, destination?: BoardColumn) => ({
    onDragOver: (event: React.DragEvent) => {
      if (dragged.current) {
        event.preventDefault();
        event.stopPropagation();
        setDropTarget(target);
      }
    },
    onDrop: (event: React.DragEvent) => drop(event, changes, destination),
    'data-drop': dropTarget === target,
  });
  const card = (task: Task) => (
    <div
      key={task.id}
      {...(view.sort === 'manual'
        ? droppable(
            task.id,
            { beforeId: task.id, ...(view.epicLanes ? { epicId: task.epicId } : {}) },
            view.presentation === 'board' ? boardColumnFor(task.column) : undefined,
          )
        : {})}
    >
      <TaskCard
        task={task}
        entities={entities}
        members={members}
        properties={view.cardProperties}
        open={() => open(task)}
        taskHref={taskHref(task)}
        complete={() => complete(task)}
        onMove={() => setMoving(task)}
        dragStart={(event) => {
          dragged.current = task;
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', task.id);
        }}
        dragEnd={() => {
          dragged.current = null;
          setDropTarget('');
        }}
      />
    </div>
  );
  const lanes: (Entity | null | undefined)[] = view.epicLanes
    ? [
        ...entities.filter(
          (e) => e.kind === 'epic' && (!e.archived || items.some((task) => task.epicId === e.id)),
        ),
        null,
      ]
    : [undefined];
  const visible = lanes.filter(
    (epic) =>
      !view.epicLanes ||
      view.showEmptyLanes ||
      items.some(
        (task) =>
          task.epicId === (epic?.id ?? null) &&
          (!mobile || view.presentation !== 'board' || boardColumnFor(task.column) === activeColumn),
      ),
  );
  return (
    <>
      {view.presentation === 'board' && (
        <label className="mobile-column-select">
          {t('column')}
          <select value={activeColumn} onChange={(e) => setColumn(taskColumnFor(e.target.value as BoardColumn))}>
            {boardColumns.map((c) => (
              <option key={c} value={c}>
                {t('column_' + c)} ({items.filter(task => boardColumnFor(task.column) === c).length})
              </option>
            ))}
          </select>
        </label>
      )}
      <div
        className="task-presentation"
        onTouchStart={(e) => {
          swipe.current = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY };
        }}
        onTouchEnd={(e) => {
          if (view.presentation !== 'board') return;
          const dx = e.changedTouches[0]!.clientX - swipe.current.x,
            dy = e.changedTouches[0]!.clientY - swipe.current.y;
          if (Math.abs(dx) > 70 && Math.abs(dy) < 50) {
            const next = boardColumns[boardColumns.indexOf(activeColumn) + (dx < 0 ? 1 : -1)];
            if (next) setColumn(taskColumnFor(next));
            lastSwipe.current = Date.now();
          }
        }}
        onClickCapture={(e) => {
          if (Date.now() - lastSwipe.current < 350) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        {visible.map((epic) => {
          const laneItems = view.epicLanes
            ? items.filter((task) => task.epicId === (epic?.id ?? null))
            : items;
          const content =
            view.presentation === 'list' ? (
              <div className="now-list">
                {laneItems.map(card)}
                {view.sort === 'manual' && (
                  <div
                    className="order-end"
                    {...droppable('end-' + (epic?.id ?? ''), {
                      beforeId: null,
                      ...(view.epicLanes ? { epicId: epic?.id ?? null } : {}),
                    })}
                  >
                    {t('moveToEnd')}
                  </div>
                )}
              </div>
            ) : (
              <div className="board">
                {boardColumns.map((c) => {
                  const columnItems = laneItems.filter((task) => boardColumnFor(task.column) === c);
                  const label = t('column_' + c);
                  const addTask = () => create(taskColumnFor(c), epic?.id);
                  return (
                    <section
                      className="board-column"
                      key={c}
                      data-active={activeColumn === c}
                      {...droppable(c + (epic?.id ?? ''), {
                        ...(view.epicLanes ? { epicId: epic?.id ?? null } : {}),
                        ...(view.sort === 'manual' ? { beforeId: null } : {}),
                      }, c)}
                    >
                      <header>
                        <h2>{label} <span className="muted">{columnItems.length}</span></h2>
                        <button
                          className="quiet icon-button"
                          aria-label={t('addTask') + ' · ' + label}
                          onClick={addTask}
                        >
                          <Plus size={18} />
                        </button>
                      </header>
                      <div className="column-cards">{columnItems.map(card)}</div>
                      <button className="column-add" onClick={addTask}>
                        <Plus size={16} />
                        {t('addTask')}
                      </button>
                    </section>
                  );
                })}
              </div>
            );
          return view.epicLanes ? (
            <details className="epic-lane" key={epic?.id ?? 'unassigned'} open>
              <summary style={epicStyle(epic ?? undefined)}>
                {epic && <EntityIcon name={epic.icon} />}
                <strong>{epic?.name ?? t('unassignedLane')}</strong>
                <span>{laneItems.length}</span>
              </summary>
              {content}
            </details>
          ) : (
            <div key="all">{content}</div>
          );
        })}
      </div>
      {moving && (
        <MoveDialog
          key={moving.id}
          task={moving}
          items={items}
          entities={entities}
          manual={view.sort === 'manual'}
          close={() => setMoving(null)}
          move={async (changes) => {
            await move(moving, changes);
            setMoving(null);
          }}
        />
      )}
    </>
  );
}
function MoveDialog({
  task,
  items,
  entities,
  manual,
  close,
  move,
}: {
  task: Task;
  items: Task[];
  entities: Entity[];
  manual: boolean;
  close: () => void;
  move: (changes: Move) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [column, setColumn] = useState(task.column),
    [epicId, setEpic] = useState(task.epicId ?? ''),
    [position, setPosition] = useState('keep'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Dialog
      open
      title={t('moveTask') + ' · ' + task.title}
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          void move({
            ...(column !== task.column ? { column } : {}),
            ...(epicId !== (task.epicId ?? '') ? { epicId: epicId || null } : {}),
            ...(position !== 'keep' ? { beforeId: position || null } : {}),
          })
            .catch((e) => setError(e instanceof Error ? e.message : 'operation_failed'))
            .finally(() => setBusy(false));
        }}
      >
        <fieldset disabled={busy}>
          <label>
            {t('column')}
            <select value={column} onChange={(e) => setColumn(e.target.value as TaskColumn)}>
              {columns.map((c) => (
                <option key={c} value={c}>
                  {t('column_' + c)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('epic')}
            <select value={epicId} onChange={(e) => setEpic(e.target.value)}>
              <option value="">{t('unassignedLane')}</option>
              {entities
                .filter((e) => e.kind === 'epic' && (!e.archived || e.id === task.epicId))
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </select>
          </label>
          {manual && (
            <label>
              {t('moveBefore')}
              <select value={position} onChange={(e) => setPosition(e.target.value)}>
                <option value="keep">{t('keepPosition')}</option>
                <option value="">{t('moveToEnd')}</option>
                {items
                  .filter((t) => t.id !== task.id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
              </select>
              <small>{t('manualOrderHelp')}</small>
            </label>
          )}
          {error && <p role="alert">{t(error)}</p>}
          <div className="button-row">
            <button
              className="primary"
              type="submit"
              disabled={
                column === task.column && epicId === (task.epicId ?? '') && position === 'keep'
              }
            >
              {t('moveTask')}
            </button>
            <button type="button" onClick={close}>
              {t('cancel')}
            </button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
function TaskCard({
  task,
  entities,
  members,
  properties,
  open,
  taskHref,
  complete,
  onMove,
  dragStart,
  dragEnd,
}: {
  task: Task;
  entities: Entity[];
  members: Member[];
  properties: SavedView['cardProperties'];
  open: () => void;
  taskHref: string;
  complete: () => void;
  onMove: () => void;
  dragStart: (event: React.DragEvent) => void;
  dragEnd: () => void;
}) {
  const { t, i18n } = useTranslation(),
    epic = entities.find((e) => e.id === task.epicId),
    show = (key: SavedView['cardProperties'][number]) => properties.includes(key);
  return (
    <article
      className={
        'task-card ' + (epic ? 'has-epic ' : '') + (task.column === 'done' ? 'completed' : '')
      }
      style={epicStyle(epic)}
    >
      <button
        className="card-move quiet"
        draggable
        onDragStart={dragStart}
        onDragEnd={dragEnd}
        aria-label={t('moveTask') + ' · ' + task.title}
        onClick={onMove}
      >
        <GripVertical size={16} />
      </button>
      <a className="card-open" href={taskHref} aria-label={task.title} onClick={event => {
        if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault(); open();
      }}>
        {epic && show('epic') && (
          <span className="card-icon">
            <EntityIcon name={epic.icon} size={26} />
          </span>
        )}
        <span className="card-content">
          <strong>{task.title}</strong>
          <span className="card-metadata">
            {show('size') && task.size && <span className="size-chip">{task.size}</span>}
            {show('estimate') && task.estimateMinutes !== null && (
              <span>{task.estimateMinutes} min</span>
            )}
            {show('high') && task.high && <Flag size={13} aria-label={t('high')} />}
            {show('deadline') && task.deadlineDate && (
              <span className={task.overdue ? 'deadline overdue' : 'deadline'}>
                {task.overdue && t('overdue') + ' · '}
                {new Intl.DateTimeFormat(i18n.language, {
                  day: 'numeric',
                  month: 'short',
                  timeZone: 'UTC',
                }).format(new Date(task.deadlineDate + 'T12:00:00Z'))}
              </span>
            )}
            {show('availability') && !task.available && (
              <span>
                <Clock3 size={13} />
                {t('unavailable')}
              </span>
            )}
            {show('assignees') &&
              task.assignees.map((id) => (
                <span
                  className="card-avatar"
                  key={id}
                  title={members.find((m) => m.id === id)?.name}
                >
                  {members
                    .find((m) => m.id === id)
                    ?.name.slice(0, 1)
                    .toUpperCase()}
                </span>
              ))}
            {(['places', 'resources', 'tags'] as const).flatMap((key) =>
              show(key)
                ? task[key].map((id) => (
                    <span key={id}>{entities.find((e) => e.id === id)?.name}</span>
                  ))
                : [],
            )}
          </span>
        </span>
      </a>
      <button
        className="card-complete"
        aria-label={t(task.column === 'done' ? 'reopen' : 'complete') + ' · ' + task.title}
        aria-pressed={task.column === 'done'}
        onClick={complete}
      >
        <span>{task.column === 'done' && <Check size={15} />}</span>
      </button>
    </article>
  );
}
