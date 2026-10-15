import { createContext, useContext, type ReactNode } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { useTranslation } from 'react-i18next';
import { columns, type Entity, type Task, type TaskColumn } from '@tendly/shared';
import { DragPlaceholder, TaskDragSurface, useTaskDrag } from './TaskDragSurface.js';
import { EntityIcon, epicStyle } from '../tasks/identity.js';
const ColumnDropContext = createContext<((id: string) => void) | null>(null);

export function TaskBoard({ items, entities, column, lanes, empty, manual, renderCard, capture, drop }: { items: Task[]; entities: Entity[]; column: TaskColumn; lanes: boolean; empty: boolean; manual: boolean; renderCard: (task: Task) => ReactNode; capture: (column: TaskColumn, epicId?: string | null) => void; drop: (id: string, changes: { column: TaskColumn; epicId?: string | null }) => void }) {
  const { t } = useTranslation();
  const groups = lanes ? [...entities.filter(e => e.kind === 'epic' && (!e.archived || items.some(t => t.epicId === e.id))), null].filter(e => empty || items.some(t => t.epicId === (e?.id ?? null))) : [undefined];
  return <TaskDragSurface manual={manual}>{groups.map(epic => {
    const group = epic === undefined ? items : items.filter(t => t.epicId === (epic?.id ?? null));
    const board = <div className="board">{columns.map(c => <BoardColumn key={c} column={c} active={column === c} epic={epic} capture={capture} drop={drop}>{group.filter(task => task.column === c).map(renderCard)}</BoardColumn>)}</div>;
    return epic === undefined ? <div key="all">{board}</div> : <details className="epic-lane" style={epicStyle(epic ?? undefined)} key={epic?.id ?? 'unassigned'} open><summary>{epic && <EntityIcon name={epic.icon} size={20} />}{epic?.name ?? t('unassigned')} <span className="muted">{group.length}</span></summary>{board}</details>;
  })}</TaskDragSurface>;
}
function BoardColumn({ column, active, epic, capture, drop, children }: { column: TaskColumn; active: boolean; epic: Entity | null | undefined; capture: (column: TaskColumn, epicId?: string | null) => void; drop: (id: string, changes: { column: TaskColumn; epicId?: string | null }) => void; children: ReactNode }) {
  const { t } = useTranslation(), drag = useTaskDrag();
  const key = `column:${epic?.id ?? 'none'}:${column}`;
  const commit = (id: string) => drop(id, { column, ...(epic !== undefined ? { epicId: epic?.id ?? null } : {}) });
  return <ColumnDropContext.Provider value={commit}><section className="board-column" data-active={active} data-drag-over={drag?.preview?.destination?.key === key} onDragOver={event => {
    if (!drag?.preview) return;
    event.preventDefault();
    drag.hover({ key, position: 'end', commit });
  }}>
    <header><h2>{t('column_' + column)}</h2><button className="quiet icon-button" aria-label={t('addTask') + ' · ' + t('column_' + column)} onClick={() => capture(column, epic?.id)}>+</button></header>
    <div className="column-cards">{children}<DragPlaceholder target={key} position="end" /></div>
    <button className="column-add" onClick={() => capture(column, epic?.id)}>{t('addTask')}</button>
  </section></ColumnDropContext.Provider>;
}
export function MovableCard({ task, manual, afterId, children, reorder, reparent, change, moveUp, moveDown }: { task: Task; manual: boolean; afterId: string | null; children: ReactNode; reorder: (beforeId: string | null, movingId?: string) => void; reparent: (movingId: string, parentId: string) => void; change: (column: TaskColumn) => void; moveUp: () => void; moveDown: () => void }) {
  const { t } = useTranslation(), drag = useTaskDrag();
  const dropInColumn = useContext(ColumnDropContext);
  const destination = drag?.preview?.destination;
  return <>
    <DragPlaceholder target={task.id} position="before" />
    <div className="movable-card" data-drag-source={drag?.preview?.source === task.id} data-nest-pending={drag?.preview?.pending === task.id} data-nest-target={destination?.key === task.id && destination.position === 'child'} draggable onDragStart={event => {
      event.dataTransfer.setData('application/x-tendly-task', task.id);
      event.dataTransfer.setData('text/plain', task.id);
      event.dataTransfer.effectAllowed = 'move';
      drag?.start(task.id, event.currentTarget.getBoundingClientRect().height);
    }} onDragOver={event => {
      if (!drag?.preview) return;
      if (drag.preview.source === task.id) { event.preventDefault(); event.stopPropagation(); drag.clearTarget(); return; }
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect(), fraction = (event.clientY - rect.top) / rect.height;
      const position = fraction < .25 ? 'before' : 'after';
      const nest = { key: task.id, position: 'child' as const, commit: (id: string) => reparent(id, task.id) };
      if (!manual && (fraction < .25 || fraction > .75)) { drag.clearTarget(); return; }
      event.stopPropagation();
      if (manual) drag.hover({ key: task.id, position, commit: id => reorder(position === 'before' ? task.id : afterId, id) }, fraction >= .25 && fraction <= .75 ? nest : undefined);
      else if (fraction >= .25 && fraction <= .75) drag.hover({ key: task.id, position: 'after', commit: id => dropInColumn?.(id) }, nest);
    }}>
      {children}
      <Popover.Root>
        <Popover.Trigger className="card-actions quiet" aria-label={t('moveTask') + ' · ' + task.title}>···</Popover.Trigger>
        <Popover.Portal><Popover.Content className="card-action-menu" side="bottom" align="end" sideOffset={6} collisionPadding={12} aria-label={t('moveTask') + ' · ' + task.title}>
          <label>{t('column')}<select value={task.column} onChange={e => change(e.target.value as TaskColumn)}>{columns.map(c => <option key={c} value={c}>{t('column_' + c)}</option>)}</select></label>
          {manual && <><button onClick={moveUp}>{t('moveUp')}</button><button onClick={moveDown}>{t('moveDown')}</button><button onClick={() => reorder(null)}>{t('moveToEnd')}</button></>}
          <small>{t('moveParentInDetails')}</small>
        </Popover.Content></Popover.Portal>
      </Popover.Root>
    </div>
    <DragPlaceholder target={task.id} position="after" />
  </>;
}
