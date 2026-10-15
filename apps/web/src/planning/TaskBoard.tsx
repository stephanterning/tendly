import type { ReactNode } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { useTranslation } from 'react-i18next';
import { columns, type Entity, type Task, type TaskColumn } from '@tendly/shared';
import { EntityIcon, epicStyle } from '../tasks/identity.js';
export function TaskBoard({ items, entities, column, lanes, empty, renderCard, capture, drop }: { items: Task[]; entities: Entity[]; column: TaskColumn; lanes: boolean; empty: boolean; renderCard: (task: Task) => ReactNode; capture: (column: TaskColumn, epicId?: string | null) => void; drop: (id: string, changes: { column: TaskColumn; epicId?: string | null }) => void }) {
  const { t } = useTranslation();
  const groups = lanes ? [...entities.filter(e => e.kind === 'epic' && (!e.archived || items.some(t => t.epicId === e.id))), null].filter(e => empty || items.some(t => t.epicId === (e?.id ?? null))) : [undefined];
  return <>{groups.map(epic => {
    const group = epic === undefined ? items : items.filter(t => t.epicId === (epic?.id ?? null));
    const board = <div className="board">{columns.map(c => <section key={c} className="board-column" data-active={column === c} onDragOver={e => { if (e.dataTransfer.types.includes('application/x-tendly-task')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }} onDrop={e => { const id = e.dataTransfer.getData('application/x-tendly-task'); if (id) { e.preventDefault(); drop(id, { column: c, ...(epic !== undefined ? { epicId: epic?.id ?? null } : {}) }); } }}><header><h2>{t('column_' + c)}</h2><button className="quiet icon-button" aria-label={t('addTask') + ' · ' + t('column_' + c)} onClick={() => capture(c, epic?.id)}>+</button></header><div className="column-cards">{group.filter(task => task.column === c).map(renderCard)}</div><button className="column-add" onClick={() => capture(c, epic?.id)}>{t('addTask')}</button></section>)}</div>;
    return epic === undefined ? <div key="all">{board}</div> : <details className="epic-lane" style={epicStyle(epic ?? undefined)} key={epic?.id ?? 'unassigned'} open><summary>{epic && <EntityIcon name={epic.icon} size={20} />}{epic?.name ?? t('unassigned')} <span className="muted">{group.length}</span></summary>{board}</details>;
  })}</>;
}
export function MovableCard({ task, manual, children, reorder, reparent, change, moveUp, moveDown }: { task: Task; manual: boolean; children: ReactNode; reorder: (beforeId: string | null, movingId?: string) => void; reparent: (movingId: string, parentId: string) => void; change: (column: TaskColumn) => void; moveUp: () => void; moveDown: () => void }) {
  const { t } = useTranslation();
  return <div className="movable-card" draggable onDragStart={e => { e.dataTransfer.setData('application/x-tendly-task', task.id); e.dataTransfer.setData('text/plain', task.id); e.dataTransfer.effectAllowed = 'move'; document.body.classList.add('dragging-task'); }} onDragEnd={() => document.body.classList.remove('dragging-task')}>
    {manual && <div className="drop-before" onDragOver={e => { e.preventDefault(); e.stopPropagation(); }} onDrop={e => { e.preventDefault(); e.stopPropagation(); reorder(task.id, e.dataTransfer.getData('application/x-tendly-task')); }}>{t('dropBefore')}</div>}
    {children}
    <div className="drop-child" onDragOver={e => { e.preventDefault(); e.stopPropagation(); }} onDrop={e => { e.preventDefault(); e.stopPropagation(); reparent(e.dataTransfer.getData('application/x-tendly-task'), task.id); }}>{t('dropAsSubtask')}</div>
    <Popover.Root><Popover.Trigger className="card-actions quiet" aria-label={t('moveTask') + ' · ' + task.title}>···</Popover.Trigger><Popover.Portal><Popover.Content className="card-action-menu" side="bottom" align="end" sideOffset={6} collisionPadding={12} aria-label={t('moveTask') + ' · ' + task.title}><label>{t('column')}<select value={task.column} onChange={e => change(e.target.value as TaskColumn)}>{columns.map(c => <option key={c} value={c}>{t('column_' + c)}</option>)}</select></label>{manual && <><button onClick={moveUp}>{t('moveUp')}</button><button onClick={moveDown}>{t('moveDown')}</button><button onClick={() => reorder(null)}>{t('moveToEnd')}</button></>}<small>{t('moveParentInDetails')}</small></Popover.Content></Popover.Portal></Popover.Root>
  </div>;
}
