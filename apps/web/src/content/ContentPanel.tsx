import { lazy, Suspense, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, result } from '../accounts/api.js';
import type { Member } from '../tasks/TaskFields.js';
const RichEditor = lazy(() => import('./RichEditor.js'));
export async function uploadFiles(householdId: string, taskId: string, files: File[], commentId: string | null = null) {
  const urls: string[] = [];
  for (const file of files) {
    if (file.size > 16 * 1024 * 1024) throw new Error('file_too_large');
    const base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = reject; reader.onload = () => resolve(String(reader.result).split(',')[1]!); reader.readAsDataURL(file); });
    const saved = await result(api.POST('/api/v1/households/{householdId}/tasks/{taskId}/files', { params: { path: { householdId, taskId } }, body: { name: file.name, base64, commentId } }));
    if (saved.mime.startsWith('image/')) urls.push(`/api/v1/households/${householdId}/files/${saved.id}`);
  }
  return urls;
}
export function ContentPanel({ householdId, taskId, actorId, members }: { householdId: string; taskId: string; actorId: string; members: Member[] }) {
  const { t } = useTranslation(), queries = useQueryClient();
  const [tab, setTab] = useState<'comments' | 'activity'>('comments'), [body, setBody] = useState(''), [editing, setEditing] = useState<{ id: string; version: number } | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const content = useQuery({ queryKey: ['planning', householdId, 'content', taskId], queryFn: () => result(api.GET('/api/v1/households/{householdId}/tasks/{taskId}/content', { params: { path: { householdId, taskId } } })) });
  const refresh = () => queries.invalidateQueries({ queryKey: ['planning', householdId, 'content', taskId] });
  async function upload(files: File[], commentId: string | null = null) { setBusy(true); setError(''); try { const urls = await uploadFiles(householdId, taskId, files, commentId); await refresh(); return urls; } catch (e) { setError((e as Error).message); return []; } finally { setBusy(false); } }
  async function saveComment() {
    setBusy(true); setError('');
    try {
      if (editing) await result(api.PUT('/api/v1/households/{householdId}/tasks/{taskId}/comments/{id}', { params: { path: { householdId, taskId, id: editing.id } }, body: { body, baseVersion: editing.version } }));
      else await result(api.POST('/api/v1/households/{householdId}/tasks/{taskId}/comments', { params: { path: { householdId, taskId } }, body: { body } }));
      setBody(''); setEditing(null); await refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="content-panel" onDragOver={e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }} onDrop={e => { if (!e.defaultPrevented && e.dataTransfer.files.length) { e.preventDefault(); void upload(Array.from(e.dataTransfer.files)); } }}>
    <h3>{t('attachments')}</h3><p className="muted small">{t('attachmentHint')}</p><div className="button-row"><label className="upload-button">{t('addFiles')}<input disabled={busy} type="file" multiple onChange={e => { void upload(Array.from(e.target.files ?? [])); e.target.value = ''; }} /></label><label className="upload-button">{t('takePhoto')}<input disabled={busy} type="file" accept="image/*" capture="environment" onChange={e => { void upload(Array.from(e.target.files ?? [])); e.target.value = ''; }} /></label></div>
    <div className="attachment-grid">{content.data?.files.map(file => <figure key={file.id}><a href={`/api/v1/households/${householdId}/files/${file.id}`} target="_blank" rel="noreferrer">{file.mime.startsWith('image/') && <img loading="lazy" alt={file.name} src={`/api/v1/households/${householdId}/files/${file.id}`} />}<figcaption>{file.name}</figcaption></a><button className="quiet" aria-label={t('delete') + ' · ' + file.name} onClick={() => { if (window.confirm(t('deleteFileConfirm'))) void result(api.DELETE('/api/v1/households/{householdId}/files/{id}', { params: { path: { householdId, id: file.id } }, body: {} })).then(refresh).catch(e => setError((e as Error).message)); }}>×</button></figure>)}</div>
    {error && <p role="alert" className="alert error">{t(error)}</p>}{content.isError && <button onClick={() => void content.refetch()}>{t('retry')}</button>}
    <div className="button-row" role="tablist">{(['comments', 'activity'] as const).map(key => <button role="tab" aria-selected={tab === key} onClick={() => setTab(key)} key={key}>{t(key)}</button>)}</div>
    {tab === 'activity' ? <ol className="activity-list">{content.data?.activity.map(event => <li key={event.id}><span>{event.actor ?? 'Tendly'} · {event.fields.map(f => t('field_' + f, { defaultValue: t(f) })).join(', ')}</span><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time></li>)}</ol> : <Suspense fallback={<p>{t('loading')}</p>}>
      <div className="comments-list">{content.data?.comments.map(comment => <article key={comment.id}><header><strong>{comment.author}</strong><time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString()}</time></header><RichEditor value={comment.body} label={t('comment')} /><div className="attachment-grid">{content.data?.files.filter(file => file.commentId === comment.id).map(file => <a key={file.id} href={`/api/v1/households/${householdId}/files/${file.id}`} target="_blank" rel="noreferrer">{file.mime.startsWith('image/') && <img alt={file.name} src={`/api/v1/households/${householdId}/files/${file.id}`} />}{file.name}</a>)}</div>{comment.authorId === actorId && <div className="button-row"><button onClick={() => { setEditing({ id: comment.id, version: comment.version }); setBody(comment.body); }}>{t('edit')}</button><button onClick={() => { if (window.confirm(t('deleteCommentConfirm'))) void result(api.DELETE('/api/v1/households/{householdId}/comments/{id}', { params: { path: { householdId, id: comment.id } }, body: { baseVersion: comment.version } })).then(refresh).catch(e => setError((e as Error).message)); }}>{t('delete')}</button><label className="upload-button">{t('addFiles')}<input type="file" multiple onChange={e => void upload(Array.from(e.target.files ?? []), comment.id)} /></label></div>}</article>)}</div>
      <fieldset disabled={busy}><RichEditor disabled={busy} value={body} onChange={setBody} label={t('comment')} members={members} upload={files => upload(files, editing?.id ?? null)} /><div className="button-row"><button className="primary" disabled={!body} onClick={() => void saveComment()}>{t(editing ? 'save' : 'postComment')}</button>{editing && <button onClick={() => { setEditing(null); setBody(''); }}>{t('cancel')}</button>}</div></fieldset>
    </Suspense>}
  </section>;
}
