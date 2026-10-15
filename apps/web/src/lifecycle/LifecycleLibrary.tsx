import { Archive, Trash2, RotateCcw, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, result } from '../accounts/api.js';
export function LifecycleLibrary({ householdId, admin, onOpen }: { householdId: string; admin: boolean; onOpen: (id: string) => void }) {
  const { t } = useTranslation(), queries = useQueryClient(), [kind, setKind] = useState<'archive' | 'trash'>('archive'), [error, setError] = useState('');
  const list = useQuery({ queryKey: ['planning', householdId, 'lifecycle', kind], queryFn: () => result(api.GET('/api/v1/households/{householdId}/lifecycle', { params: { path: { householdId }, query: { kind } } })) });
  const settings = useQuery({ queryKey: ['planning', householdId, 'lifecycle-settings'], queryFn: () => result(api.GET('/api/v1/households/{householdId}/lifecycle-settings', { params: { path: { householdId } } })) });
  async function change(id: string, version: number, action: 'restore' | 'unarchive' | 'delete', confirmed = false) {
    if (action === 'delete' && !confirmed && !window.confirm(t('permanentDeleteConfirm'))) return;
    try { await result(api.POST('/api/v1/households/{householdId}/tasks/{id}/lifecycle', { params: { path: { householdId, id } }, body: { baseVersion: version, action, confirmed } })); await queries.invalidateQueries({ queryKey: ['planning', householdId] }); }
    catch (e) { if ((e as Error).message === 'confirm_dependent_deletion' && window.confirm(t('confirm_dependent_deletion'))) await change(id, version, action, true); else setError((e as Error).message); }
  }
  return <section><header className="page-heading"><h1 className="icon-label"><Archive aria-hidden="true" />{t('archiveAndTrash')}</h1></header><div className="button-row">{(['archive', 'trash'] as const).map(k => <button aria-pressed={kind === k} key={k} onClick={() => setKind(k)}>{t(k)}</button>)}</div>{error && <p role="alert">{t(error)}</p>}{list.isError && <button onClick={() => void list.refetch()}>{t('retry')}</button>}<div className="planning-documents">{list.data?.map(task => <article key={task.id}><div><strong>{task.title}</strong><small>{new Date((kind === 'archive' ? task.archivedAt : task.trashedAt)!).toLocaleDateString()}</small></div>{kind === 'archive' && <button onClick={() => onOpen(task.id)}>{t('open')}</button>}<button onClick={() => void change(task.id, task.version, kind === 'archive' ? 'unarchive' : 'restore')}><RotateCcw size={16} aria-hidden="true" />{t('restore')}</button>{admin && kind === 'trash' && <button className="danger" onClick={() => void change(task.id, task.version, 'delete')}><Trash2 size={16} aria-hidden="true" />{t('deletePermanently')}</button>}</article>)}</div>
    {admin && settings.data && <HousekeepingSettings key={settings.data.version} initial={settings.data} save={async value => { await result(api.PUT('/api/v1/households/{householdId}/lifecycle-settings', { params: { path: { householdId } }, body: value })); await settings.refetch(); }} />}
  </section>;
}
function HousekeepingSettings({ initial, save }: { initial: { version: number; archiveDays: number | null; trashDays: number }; save: (value: typeof initial) => Promise<void> }) {
  const { t } = useTranslation(), [value, setValue] = useState(initial), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  return <form onSubmit={e => { e.preventDefault(); setBusy(true); void save(value).catch(e => setError((e as Error).message)).finally(() => setBusy(false)); }}><fieldset disabled={busy}><legend className="icon-label"><Settings2 size={18} aria-hidden="true" />{t('housekeeping')}</legend><label>{t('autoArchiveDays')}<input type="number" min={1} max={3650} value={value.archiveDays ?? ''} onChange={e => setValue({ ...value, archiveDays: e.target.value === '' ? null : Number(e.target.value) })} /></label><p className="muted">{t('archiveDisableHint')}</p><label>{t('trashRetentionDays')}<input type="number" required min={1} max={3650} value={value.trashDays} onChange={e => setValue({ ...value, trashDays: Number(e.target.value) })} /></label>{error && <p role="alert">{t(error)}</p>}<button className="primary">{t('save')}</button></fieldset></form>;
}
