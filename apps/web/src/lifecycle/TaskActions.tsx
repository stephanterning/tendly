import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Task, Recurrence } from '@tendly/shared';
import { api, result } from '../accounts/api.js';
import { Dialog } from '../components/ui/dialog.js';
import { RecurrenceFields } from './TemplateLibrary.js';
export function TaskActions({ task, householdId, timezone, flush, onClose, onSeries, onLifecycle }: { task: Task; householdId: string; timezone: string; flush: () => Promise<Task | null>; onClose: () => void; onSeries: (id: string) => void; onLifecycle: (undo: { id: string; version: number; action: 'restore' | 'unarchive' }) => void }) {
  const { t } = useTranslation(), queries = useQueryClient();
  const [capture, setCapture] = useState(false), [name, setName] = useState(task.title), [recurrence, setRecurrence] = useState<Recurrence | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  async function lifecycle(action: 'archive' | 'trash', confirmed = false) {
    const current = await flush();
    if (!current) return;
    if (!confirmed && !window.confirm(t(action === 'trash' ? 'trashSubtreeConfirm' : 'archiveConfirm'))) return;
    setBusy(true); setError('');
    try {

      await result(api.POST('/api/v1/households/{householdId}/tasks/{id}/lifecycle', { params: { path: { householdId, id: task.id } }, body: { baseVersion: current.version, action, confirmed } }));
      await queries.invalidateQueries({ queryKey: ['planning', householdId] }); onLifecycle({ id: task.id, version: current.version + 1, action: action === 'trash' ? 'restore' : 'unarchive' }); onClose();
    } catch (e) { if ((e as Error).message === 'confirm_dependent_deletion' && window.confirm(t('confirm_dependent_deletion'))) await lifecycle(action, true); else setError((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="task-actions">{task.recurrenceTemplateId && <p className="alert">{t('editingOccurrence')} <button onClick={() => { void flush().then(ok => { if (ok) onSeries(task.recurrenceTemplateId!); }); }}>{t('editSeries')}</button></p>}<div className="button-row"><button disabled={busy} onClick={() => { void flush().then(ok => { if (ok) setCapture(true); }); }}>{t('saveAsTemplate')}</button><button disabled={busy} onClick={() => void lifecycle('archive')}>{t('archive')}</button><button disabled={busy} onClick={() => void lifecycle('trash')}>{t('moveToTrash')}</button></div>{error && <p role="alert">{t(error)}</p>}{notice && <p role="status">{t(notice)}</p>}
    {capture && <Dialog open title={t('saveAsTemplate')} onOpenChange={open => { if (!open && !busy) setCapture(false); }}><form onSubmit={e => { e.preventDefault(); setBusy(true); void result(api.POST('/api/v1/households/{householdId}/templates', { params: { path: { householdId } }, body: { taskId: task.id, name, recurrence } })).then(async () => { await queries.invalidateQueries({ queryKey: ['planning', householdId] }); setCapture(false); setNotice('templateSaved'); }).catch(e => setError((e as Error).message)).finally(() => setBusy(false)); }}><fieldset disabled={busy}><label>{t('entityName')}<input required value={name} onChange={e => setName(e.target.value)} /></label><RecurrenceFields timezone={timezone} value={recurrence} onChange={setRecurrence} /><p className="muted">{t('templateCaptureHint')}</p>{error && <p role="alert">{t(error)}</p>}<button className="primary">{t('save')}</button></fieldset></form></Dialog>}
  </section>;
}
