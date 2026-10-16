import { EntityIcon, epicStyle } from './identity.js';
import { ContentPanel, uploadFiles } from '../content/ContentPanel.js';
import { TaskActions } from '../lifecycle/TaskActions.js';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { taskFields, type Task, type TaskChanges, type Entity } from '@tendly/shared';
import { Dialog } from '../components/ui/dialog.js';
import { TaskFields, type Member } from './TaskFields.js';
import { TaskStructure } from './TaskStructure.js';
import { EditFailure } from './api.js';
export function TaskEditor({ task, entities, members, timezone, onSave, onRefresh, onClose, householdId, onOpen, onCreated, onToggle, actorId, onSeries, onLifecycle }: {
  onSeries: (id: string) => void; onLifecycle: (undo: { id: string; version: number; action: 'restore' | 'unarchive' }) => void;
  actorId: string; householdId: string; onOpen: (id: string) => void; onCreated: (task: Task) => void; onToggle: (id: string) => Promise<void>;
  task: Task; entities: Entity[]; members: Member[]; timezone: string;
  onRefresh: (task: Task) => void;
  onSave: (base: Task, changes: TaskChanges, confirm?: boolean, confirmDescendants?: boolean) => Promise<Task>; onClose: () => void;
}) {
  const { t } = useTranslation();
  const [base, setBase] = useState(task);
  const [draft, setDraft] = useState(taskFields.parse(task.local));
  const [failure, setFailure] = useState<EditFailure | null>(null);
  const [pending, setPending] = useState(false);
  const titleInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const input = titleInput.current;
    if (!input) return;
    const fit = () => { input.style.height = 'auto'; input.style.height = input.scrollHeight + 'px'; };
    fit();
    let width = input.clientWidth;
    const observer = new ResizeObserver(() => {
      if (input.clientWidth !== width) { width = input.clientWidth; fit(); }
    });
    observer.observe(input);
    return () => observer.disconnect();
  }, [draft.title]);
  const epic = entities.find(entity => entity.id === base.epicId);
  const saving = useRef(false);
  const latest = useRef(base); latest.current = base;
  const changes: TaskChanges = Object.fromEntries(Object.entries(draft).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(base.local[key as keyof typeof base.local])));
  const signature = JSON.stringify(changes);
  async function save(from = base, confirmed = false): Promise<boolean> {
    if (saving.current) return false;
    if (signature === '{}') return true;
    if (!draft.title.trim()) { setFailure(new EditFailure('invalid_input')); return false; }
    saving.current = true; setPending(true); setFailure(null);
    try {
      const next = await onSave(from, changes, confirmed && failure?.message === 'confirm_unavailable', confirmed && failure?.message === 'confirm_descendants');
      latest.current = next; setBase(next); setDraft(taskFields.parse(next.local)); return true;
    } catch (error) {
      setFailure(error instanceof EditFailure ? error : new EditFailure('network_error')); return false;
    } finally { saving.current = false; setPending(false); }
  }
  useEffect(() => {
    // Conflict resolution may be newer than the query cache. Never move backwards.
    if (signature === '{}' && !pending && (task.version > base.version || task.version === base.version && JSON.stringify(task) !== JSON.stringify(base))) {
      setBase(task); setDraft(taskFields.parse(task.local));
    }
  }, [task, signature, pending, base.version]);
  useEffect(() => {
    // Conflict resolution may be newer than the query cache. Never move backwards.
    if (signature === '{}' && !pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [signature, pending]);
  useEffect(() => {
    if (signature === '{}' || failure || pending) return;
    const timer = window.setTimeout(() => void save(), 650);
    return () => window.clearTimeout(timer);
  }); // Restart debounce whenever the draft changes; failed edits never retry silently.
  return <Dialog open onOpenChange={open => { if (!open) void save().then(ok => { if (ok) onClose(); }); }} title={t('taskDetails')} sheet className="task-detail-sheet">
    <p className="save-status small muted" role="status">{pending ? t('saving') : failure ? t('taskSaveFailed') : signature === '{}' ? t('taskSaved') : t('saving')}</p>
    {failure && <div className="alert error" role="alert">
      <p>{t(failure.message === 'task_conflict' ? 'conflictText' : failure.message)}</p>
      {failure.current ? <div className="button-row"><button onClick={() => { onRefresh(failure.current!); setBase(failure.current!); setDraft(taskFields.parse(failure.current!.local)); setFailure(null); }}>{t('useLatest')}</button><button onClick={() => void save(failure.current!)}>{t('keepMine')}</button></div>
        : <button onClick={() => void save(base, ['confirm_unavailable', 'confirm_descendants'].includes(failure.message))}>{t(failure.message === 'confirm_unavailable' ? 'startAnyway' : failure.message === 'confirm_descendants' ? 'completeAnyway' : 'retry')}</button>}
    </div>}
    <div className="task-detail-layout">
    <div className="task-detail-content">
    {epic && <div className="detail-epic" style={epicStyle(epic)}><EntityIcon name={epic.icon} size={18} />{epic.name}</div>}
    <fieldset disabled={pending}>
      <label className="sr-only" htmlFor="task-title">{t('taskTitle')}</label>
      <textarea ref={titleInput} id="task-title" className="task-title-input" rows={1} maxLength={300} value={draft.title} onChange={e => { setDraft({ ...draft, title: e.target.value }); setFailure(null); }} />
      <a className="mobile-planning-link" href="#task-planning" onClick={event => { event.preventDefault(); document.getElementById('task-planning')?.scrollIntoView({ block: 'start' }); document.querySelector<HTMLSelectElement>('#task-planning select')?.focus({ preventScroll: true }); }}>{t('planningDetails')} ↓</a>
      {base.deadlineBeyondParent && <p className="alert" role="status">{t('deadlineBeyondParent')}</p>}
      <TaskFields section="description" disabled={pending} upload={async files => { try { return await uploadFiles(householdId, base.id, files); } catch (error) { setFailure(new EditFailure((error as Error).message)); return []; } }} inheritance={base} value={draft} onChange={changes => { setDraft({ ...draft, ...changes }); setFailure(null); }} entities={entities} members={members} timezone={timezone} />
    </fieldset>
    <fieldset disabled={pending}><TaskStructure task={base} draft={draft} householdId={householdId} onChange={changes => { setDraft({ ...draft, ...changes }); setFailure(null); }} onOpen={id => { void save().then(ok => { if (ok) onOpen(id); }); }} onCreated={onCreated} onToggle={onToggle} /></fieldset>
    <ContentPanel householdId={householdId} taskId={base.id} actorId={actorId} members={members} />
    </div>
    <aside id="task-planning" className="task-detail-properties" aria-label={t('planningPanel')}>
      <fieldset disabled={pending}><TaskFields section="properties" disabled={pending} inheritance={base} value={draft} onChange={changes => { setDraft({ ...draft, ...changes }); setFailure(null); }} entities={entities} members={members} timezone={timezone} /></fieldset>
    <TaskActions timezone={timezone} onSeries={onSeries} onLifecycle={onLifecycle} task={base} householdId={householdId} flush={async () => await save() ? latest.current : null} onClose={onClose} />
    </aside>
    </div>
  </Dialog>;
}
