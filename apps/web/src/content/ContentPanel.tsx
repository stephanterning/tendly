import { useEffect, useId, useRef, useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, FileText, Plus } from 'lucide-react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toDocument, documentSchema, plainText, type TaskFields } from '@tendly/shared';
import { api, result } from '../accounts/api.js';
import { RichEditor } from './RichEditor.js';
import { uploadFile, type UploadedFile } from './api.js';
import { Uploads, useUploads } from './Uploads.js';
import { Dialog } from '../components/ui/dialog.js';
import type { Member } from '../tasks/TaskFields.js';
export function ContentPanel({
  householdId,
  taskId,
  userId,
  members,
  onBusyChange,
  onPendingChange,
  onInsert, commentId = '', searchMatch = '',
}: {
  householdId: string;
  commentId?: string; searchMatch?: string;
  taskId: string;
  userId: string;
  members: Member[];
  onBusyChange?: (busy: boolean) => void;
  onPendingChange?: (pending: boolean) => void;
  onInsert?: (file: UploadedFile) => void;
}) {
  const { t, i18n } = useTranslation();
  const tabsId = useId();
  const queries = useQueryClient();
  const [contentValid, setContentValid] = useState(true);
  const [tab, setTab] = useState<'comments' | 'activity'>('comments');
  const draftKey = `tendly-comment:${userId}:${householdId}:${taskId}`;
  const [draft, setDraft] = useState<TaskFields['description']>(() => {
    try {
      const stored = sessionStorage.getItem(draftKey);
      return stored ? documentSchema.parse(JSON.parse(stored).draft) : toDocument('');
    } catch {
      return toDocument('');
    }
  });
  const [editing, setEditing] = useState<{
    id: string;
    version: number;
  } | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(draftKey) ?? '{}').editing ?? null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    try {
      if (plainText(draft).trim() || JSON.stringify(draft).includes('"image"'))
        sessionStorage.setItem(draftKey, JSON.stringify({ draft, editing }));
      else sessionStorage.removeItem(draftKey);
    } catch {
      /* Draft stays in memory if browser storage is unavailable. */
    }
  }, [draftKey, draft, editing]);
  const [undo, setUndo] = useState<{ id: string; version: number } | null>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const [editorPending, setEditorPending] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [preview, setPreview] = useState<{
      id: string;
      name: string;
      image: boolean;
    } | null>(null);
  const uploads = useUploads((...args) => upload(...args));
  useEffect(() => { onBusyChange?.(busy || editorBusy || uploads.busy); }, [busy, editorBusy, uploads.busy, onBusyChange]);
  useEffect(() => { onPendingChange?.(editorPending || uploads.pending); }, [editorPending, uploads.pending, onPendingChange]);
  const policy = useQuery({
    queryKey: ['planning', householdId, 'upload-policy'],
    queryFn: () =>
      result(
        api.GET('/api/v1/households/{householdId}/upload-policy', {
          params: { path: { householdId } },
        }),
      ),
  });
  const path = { householdId, taskId };
  const comments = useInfiniteQuery({
    queryKey: ['planning', householdId, 'comments', taskId],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      result(
        api.GET('/api/v1/households/{householdId}/tasks/{taskId}/comments', {
          params: { path, query: { offset: pageParam } },
        }),
      ),
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  });
  const history = useInfiniteQuery({
    queryKey: ['planning', householdId, 'activity', taskId],
    initialPageParam: 0,
    enabled: tab === 'activity',
    queryFn: ({ pageParam }) =>
      result(
        api.GET('/api/v1/households/{householdId}/tasks/{taskId}/activity', {
          params: { path, query: { offset: pageParam } },
        }),
      ),
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  });
  const files = useQuery({
    queryKey: ['planning', householdId, 'attachments', taskId],
    queryFn: () =>
      result(
        api.GET('/api/v1/households/{householdId}/tasks/{taskId}/attachments', {
          params: { path },
        }),
      ),
  });
  const landedComment = useRef('');
  const targetComment = comments.data?.pages.flatMap(p => p.items).find(c => c.id === commentId);
  useEffect(() => {
    if (!commentId || landedComment.current === commentId || comments.isError || files.isPending) return;
    if (!targetComment) {
      if (comments.hasNextPage && !comments.isFetching) void comments.fetchNextPage();
      return;
    }
    setTab('comments');
    const frame = requestAnimationFrame(() => {
      const element = document.getElementById('comment-' + commentId);
      if (element) { element.scrollIntoView({ block: 'center' }); element.focus({ preventScroll: true }); landedComment.current = commentId; }
    });
    return () => cancelAnimationFrame(frame);
  }, [commentId, targetComment, comments, files.isPending]);
  const refresh = (key = 'comments') =>
    queries.invalidateQueries({
      queryKey: ['planning', householdId, key, taskId],
    });
  const upload = async (file: File, id: string, progress: (percent: number) => void) => {
    setError('');
    try {
      return await uploadFile(householdId, taskId, file, id, progress);
    } finally {
      void refresh('attachments');
    }
  };
  async function post() {
    if (!contentValid) return;
    setBusy(true);
    setError('');
    try {
      const body = { body: toDocument(draft) };
      if (editing)
        await result(
          api.PATCH('/api/v1/households/{householdId}/tasks/{taskId}/comments/{id}', {
            params: { path: { ...path, id: editing.id } },
            body: { ...body, baseVersion: editing.version },
          }),
        );
      else
        await result(
          api.POST('/api/v1/households/{householdId}/tasks/{taskId}/comments', {
            params: { path },
            body,
          }),
        );
      setDraft((current) =>
        JSON.stringify(current) === JSON.stringify(draft) ? toDocument('') : current,
      );
      setEditing(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'network_error');
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string, version: number, deleted: boolean) {
    setBusy(true);
    setError('');
    try {
      const updated = await result(
        api.PATCH('/api/v1/households/{householdId}/tasks/{taskId}/comments/{id}', {
          params: { path: { ...path, id } },
          body: { baseVersion: version, deleted },
        }),
      );
      setUndo(deleted ? { id, version: updated.version } : null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'network_error');
    } finally {
      setBusy(false);
    }
  }
  const images = files.data?.filter(file => file.preview) ?? [];
  const imageIndex = images.findIndex(file => file.id === preview?.id);
  function navigateImage(direction: number) {
    const file = images[(imageIndex + direction + images.length) % images.length];
    if (file) setPreview({ id: file.id, name: file.name, image: true });
  }
  const date = (v: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(v));
  return (
    <section className="task-content">
      <div className="attachment-heading">
      <h3>{t('attachments')}{files.data && <span className="muted file-count">{files.data.length}</span>}</h3>
      <div className="attachment-actions">
        <label className="file-button">
          <Plus size={17} />{t('addFiles')}
          <input
            type="file"
            multiple
            aria-label={t('attachFiles')}
            disabled={busy}
            onChange={(e) => {
              for (const file of Array.from(e.target.files ?? [])) uploads.queue.add(crypto.randomUUID(), file);
              e.target.value = '';
            }}
          />
        </label>
        <label className="file-button">
          <Camera size={17} /><span>{t('takePhoto')}</span>
          <input
            type="file"
            accept="image/*,.heic,.heif"
            capture="environment"
            disabled={busy}
            onChange={(e) => {
              for (const file of Array.from(e.target.files ?? [])) uploads.queue.add(crypto.randomUUID(), file);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      </div>
      {files.isLoading && <p className="small muted" role="status">{t('loadingFiles')}</p>}
      {files.isError && (
        <p role="alert">
          {t('network_error')} <button onClick={() => void files.refetch()}>{t('retry')}</button>
        </p>
      )}
      <Uploads queue={uploads.queue} />
      <ul className="attachment-gallery">
        {files.data?.map(file => (
          <li key={file.id}>
            {file.preview || file.mime === 'application/pdf' ? <button className="attachment-preview" type="button"
              aria-label={`${t('preview')} ${file.name}`} onClick={() => setPreview({ id: file.id, name: file.name, image: file.preview })}>
              {file.preview ? <img alt="" loading="lazy" src={`/api/v1/households/${householdId}/attachments/${file.id}/thumbnail`} />
                : <span className="attachment-file-icon"><FileText size={32} /></span>}
              <span className="attachment-name">{file.name}</span>
            </button> : <div className="attachment-preview"><span className="attachment-file-icon"><FileText size={32} /></span><span className="attachment-name">{file.name}</span></div>}
            <div className="attachment-caption"><span>{(file.size / 1_000_000).toFixed(1)} MB</span>
              <a href={`/api/v1/households/${householdId}/attachments/${file.id}/download`} aria-label={`${t('download')} ${file.name}`}>{t('download')}</a>
            </div>
            {file.preview && onInsert && <button type="button" className="attachment-insert" aria-label={`${t('insertInDescription')} ${file.name}`} onClick={() => onInsert({
              src: `/api/v1/households/${householdId}/attachments/${file.id}/preview`, name: file.name, image: true,
            })}>{t('insertInDescription')}</button>}
          </li>
        ))}
      </ul>
      {!files.isLoading && !files.isError && files.data?.length === 0 && <p className="attachment-empty muted">{t('emptyAttachments')}</p>}
      <details className="file-help"><summary>{t('fileInformation')}</summary><p className="small muted">{t('fileHelp', { max: (policy.data?.maxBytes ?? 50_000_000) / 1_000_000 })}</p></details>
      <div
        className="content-tabs"
        role="tablist"
        aria-label={t('taskContent')}
        onKeyDown={(event) => {
          if (editorPending || busy) return;
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const next =
              event.key === 'Home'
                ? 'comments'
                : event.key === 'End'
                  ? 'activity'
                  : tab === 'comments'
                    ? 'activity'
                    : 'comments';
            setTab(next);
            document.getElementById(tabsId + '-' + next)?.focus();
          }
        }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'comments'}
          id={tabsId + '-comments'}
          aria-controls={tabsId + '-panel'}
          tabIndex={tab === 'comments' ? 0 : -1}
          onClick={() => setTab('comments')}
        >
          {t('comments')}
        </button>
        <button
          type="button"
          role="tab"
          disabled={editorPending || busy}
          aria-selected={tab === 'activity'}
          id={tabsId + '-activity'}
          aria-controls={tabsId + '-panel'}
          tabIndex={tab === 'activity' ? 0 : -1}
          onClick={() => setTab('activity')}
        >
          {t('activity')}
        </button>
      </div>
      {error && (
        <div role="alert" className="alert error">
          {t(error)}
          {error === 'comment_conflict' && (
            <button
              type="button"
              onClick={() => {
                void comments.refetch();
              }}
            >
              {t('loadLatest')}
            </button>
          )}
        </div>
      )}
      {busy && <p role="status">{t('saving')}</p>}
      <div role="tabpanel" id={tabsId + '-panel'} aria-labelledby={tabsId + '-' + tab}>
        {tab === 'comments' ? (
          <>
            <fieldset disabled={busy}>
              <RichEditor
                value={draft}
                onChange={setDraft}
                onValidityChange={setContentValid}
                onBusyChange={setEditorBusy}
                onPendingChange={setEditorPending}
                members={members}
                label={t(editing ? 'editComment' : 'newComment')}
                onUpload={upload}
              />
              <div className="button-row">
                <button type="button" className="primary" disabled={editorPending || !contentValid} onClick={() => void post()}>
                  {t(editing ? 'save' : 'postComment')}
                </button>
                {editing && (
                  <button
                    type="button"
                    disabled={editorPending}
                    onClick={() => {
                      setEditing(null);
                      setDraft(toDocument(''));
                      setError('');
                    }}
                  >
                    {t('cancel')}
                  </button>
                )}
              </div>
            </fieldset>
            {undo && (
              <p role="status">
                {t('commentDeleted')}{' '}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove(undo.id, undo.version, false)}
                >
                  {t('undo')}
                </button>
              </p>
            )}
            {comments.isError && (
              <p role="alert">
                {t('network_error')}{' '}
                <button onClick={() => void comments.refetch()}>{t('retry')}</button>
              </p>
            )}
            {commentId && !targetComment && !comments.hasNextPage && !comments.isFetching && !comments.isError && <p role="status">{t('searchTargetGone')}</p>}
            {comments.data?.pages
              .flatMap((p) => p.items)
              .map((c) => (
                <article className={'comment' + (c.id === commentId ? ' search-landing' : '')} id={'comment-' + c.id} tabIndex={-1} key={c.id}>
                  <header>
                    <strong>{c.author}</strong>
                    <time dateTime={c.createdAt}>{date(c.createdAt)}</time>
                    {c.updatedAt !== c.createdAt && (
                      <span className="small muted">{t('edited')}</span>
                    )}
                  </header>
                  <RichEditor value={c.body} searchMatch={c.id === commentId ? searchMatch : ''} readOnly label={t('comment')} />
                  {c.authorId === userId && (
                    <div className="button-row">
                      <button
                        type="button"
                        disabled={busy || editorPending}
                        onClick={() => {
                          setEditing({ id: c.id, version: c.version });
                          setDraft(toDocument(c.body));
                          setError('');
                        }}
                      >
                        {t('edit')}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void remove(c.id, c.version, true)}
                      >
                        {t('delete')}
                      </button>
                    </div>
                  )}
                </article>
              ))}
            {comments.hasNextPage && (
              <button onClick={() => void comments.fetchNextPage()}>{t('loadMore')}</button>
            )}
          </>
        ) : (
          <>
            {history.isError && (
              <p role="alert">
                {t('network_error')}{' '}
                <button onClick={() => void history.refetch()}>{t('retry')}</button>
              </p>
            )}
            <ol className="activity-list">
              {history.data?.pages
                .flatMap((p) => p.items)
                .map((a) => (
                  <li key={a.id}>
                    <strong>{a.author}</strong> ·{' '}
                    {a.fields.includes('created') ? t('activityCreated') : a.fields.length === 1 && a.fields[0] === 'description' ? t('activityDescription') : t('activityChanged', { fields: a.fields.map(f => t(f === 'epicId' ? 'epic' : f)).join(', ') })}
                    <time dateTime={a.createdAt}>{date(a.createdAt)}</time>
                  </li>
                ))}
            </ol>
            {history.hasNextPage && (
              <button onClick={() => void history.fetchNextPage()}>{t('loadMore')}</button>
            )}
          </>
        )}
      </div>
      {preview && (
        <Dialog
          open
          title={preview.name}
          className="image-preview-dialog"
          onOpenChange={(open) => {
            if (!open) setPreview(null);
          }}
        >
          {preview.image ? (
            <img
              className="file-preview"
              alt={preview.name}
              src={`/api/v1/households/${householdId}/attachments/${preview.id}/preview`}
            />
          ) : (
            <iframe
              className="pdf-preview"
              title={preview.name}
              src={`/api/v1/households/${householdId}/attachments/${preview.id}/preview`}
            />
          )}
          {preview.image && images.length > 1 && <div className="image-navigation">
            <button type="button" className="icon-button quiet" aria-label={t('previousImage')} onClick={() => navigateImage(-1)}><ChevronLeft size={20} /></button>
            <span className="small muted" role="status">{imageIndex + 1} / {images.length}</span>
            <button type="button" className="icon-button quiet" aria-label={t('nextImage')} onClick={() => navigateImage(1)}><ChevronRight size={20} /></button>
          </div>}
          <a href={`/api/v1/households/${householdId}/attachments/${preview.id}/download`}>
            {t('downloadOriginal')}
          </a>
        </Dialog>
      )}
    </section>
  );
}
