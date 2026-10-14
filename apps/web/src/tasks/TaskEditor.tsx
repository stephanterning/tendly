import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { taskFields, type Task, type TaskChanges, type Entity } from '@tendly/shared';
import { Dialog } from '../components/ui/dialog.js';
import { TaskFields, type Member } from './TaskFields.js';
import { EditFailure } from './api.js';
export function TaskEditor({ task, entities, members, timezone, onSave, onRefresh, onClose }: {
  task: Task; entities: Entity[]; members: Member[]; timezone: string;
  onRefresh: (task: Task) => void;
  onSave: (base: Task, changes: TaskChanges, confirm?: boolean) => Promise<Task>; onClose: () => void;
}) {
  const { t } = useTranslation();
  const [base, setBase] = useState(task);
  const [draft, setDraft] = useState(taskFields.parse(task));
  const [failure, setFailure] = useState<EditFailure | null>(null);
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  const changes: TaskChanges = Object.fromEntries(Object.entries(draft).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(base[key as keyof Task])));
  const signature = JSON.stringify(changes);
  async function save(from = base, confirmed = false): Promise<boolean> {
    if (saving.current) return false;
    if (signature === '{}') return true;
    if (!draft.title.trim()) { setFailure(new EditFailure('invalid_input')); return false; }
    saving.current = true; setPending(true); setFailure(null);
    try {
      const next = await onSave(from, changes, confirmed);
      setBase(next); setDraft(taskFields.parse(next)); return true;
    } catch (error) {
      setFailure(error instanceof EditFailure ? error : new EditFailure('network_error')); return false;
    } finally { saving.current = false; setPending(false); }
  }
  useEffect(() => {
    // Conflict resolution may be newer than the query cache. Never move backwards.
    if (signature === '{}' && !pending && task.version > base.version) {
      setBase(task); setDraft(taskFields.parse(task));
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
  return <Dialog open onOpenChange={open => { if (!open) void save().then(ok => { if (ok) onClose(); }); }} title={t('taskDetails')} sheet>
    <p className="save-status small muted" role="status">{pending ? t('saving') : failure ? t('taskSaveFailed') : signature === '{}' ? t('taskSaved') : t('saving')}</p>
    {failure && <div className="alert error" role="alert">
      <p>{t(failure.message === 'task_conflict' ? 'conflictText' : failure.message)}</p>
      {failure.current ? <div className="button-row"><button onClick={() => { onRefresh(failure.current!); setBase(failure.current!); setDraft(taskFields.parse(failure.current!)); setFailure(null); }}>{t('useLatest')}</button><button onClick={() => void save(failure.current!)}>{t('keepMine')}</button></div>
        : <button onClick={() => void save(base, failure.message === 'confirm_unavailable')}>{t(failure.message === 'confirm_unavailable' ? 'column_in_progress' : 'retry')}</button>}
    </div>}
    <fieldset disabled={pending}>
      <label className="sr-only" htmlFor="task-title">{t('taskTitle')}</label>
      <textarea id="task-title" className="task-title-input" rows={2} maxLength={300} value={draft.title} onChange={e => { setDraft({ ...draft, title: e.target.value }); setFailure(null); }} />
      <TaskFields value={draft} onChange={changes => { setDraft({ ...draft, ...changes }); setFailure(null); }} entities={entities} members={members} timezone={timezone} />
    </fieldset>
  </Dialog>;
}
