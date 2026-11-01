import { useEffect, useId, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toDocument, documentSchema, plainText, type TaskFields } from '@tendly/shared';
import { api, result } from '../accounts/api.js';
import { RichEditor } from './RichEditor.js';
import { uploadFiles } from './api.js';
import { Dialog } from '../components/ui/dialog.js';
import type { Member } from '../tasks/TaskFields.js';
export function ContentPanel({
  householdId,
  taskId,
  userId,
  members,
}: {
  householdId: string;
  taskId: string;
  userId: string;
  members: Member[];
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
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [preview, setPreview] = useState<{
      id: string;
      name: string;
      image: boolean;
    } | null>(null);
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
  const refresh = (key = 'comments') =>
    queries.invalidateQueries({
      queryKey: ['planning', householdId, key, taskId],
    });
  const upload = async (selected: File[]) => {
    setError('');
    try {
      return await uploadFiles(householdId, taskId, selected);
    } finally {
      await refresh('attachments');
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
  const date = (v: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(v));
  return (
    <section className="task-content">
      <h3>{t('attachments')}</h3>
      <p className="small muted">
        {t('fileHelp', {
          max: (policy.data?.maxBytes ?? 50_000_000) / 1_000_000,
        })}
      </p>
      <div className="button-row">
        <label className="file-button">
          {t('attachFiles')}
          <input
            type="file"
            multiple
            disabled={busy}
            onChange={(e) => {
              setBusy(true);
              void upload(Array.from(e.target.files ?? []))
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
              e.target.value = '';
            }}
          />
        </label>
        <label className="file-button">
          {t('takePhoto')}
          <input
            type="file"
            accept="image/*,.heic,.heif"
            capture="environment"
            disabled={busy}
            onChange={(e) => {
              setBusy(true);
              void upload(Array.from(e.target.files ?? []))
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
              e.target.value = '';
            }}
          />
        </label>
      </div>
      {files.isError && (
        <p role="alert">
          {t('network_error')} <button onClick={() => void files.refetch()}>{t('retry')}</button>
        </p>
      )}
      <ul className="attachment-list">
        {files.data?.map((f) => (
          <li key={f.id}>
            {f.preview && (
              <img
                alt=""
                loading="lazy"
                src={`/api/v1/households/${householdId}/attachments/${f.id}/thumbnail`}
              />
            )}
            <span>
              {f.name}
              <small>{(f.size / 1_000_000).toFixed(1)} MB</small>
            </span>
            {(f.preview || f.mime === 'application/pdf') && (
              <button
                type="button"
                onClick={() => setPreview({ id: f.id, name: f.name, image: f.preview })}
              >
                {t('preview')}
              </button>
            )}
            <a href={`/api/v1/households/${householdId}/attachments/${f.id}/download`}>
              {t('download')}
            </a>
          </li>
        ))}
      </ul>
      <div
        className="content-tabs"
        role="tablist"
        aria-label={t('taskContent')}
        onKeyDown={(event) => {
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
                members={members}
                label={t(editing ? 'editComment' : 'newComment')}
                onUpload={upload}
              />
              <div className="button-row">
                <button type="button" className="primary" onClick={() => void post()}>
                  {t(editing ? 'save' : 'postComment')}
                </button>
                {editing && (
                  <button
                    type="button"
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
            {comments.data?.pages
              .flatMap((p) => p.items)
              .map((c) => (
                <article className="comment" key={c.id}>
                  <header>
                    <strong>{c.author}</strong>
                    <time dateTime={c.createdAt}>{date(c.createdAt)}</time>
                    {c.updatedAt !== c.createdAt && (
                      <span className="small muted">{t('edited')}</span>
                    )}
                  </header>
                  <RichEditor value={c.body} readOnly label={t('comment')} />
                  {c.authorId === userId && (
                    <div className="button-row">
                      <button
                        type="button"
                        disabled={busy}
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
                    {a.fields
                      .map((f) => t(f === 'epicId' ? 'epic' : f === 'high' ? 'high' : f))
                      .join(', ')}
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
          <a href={`/api/v1/households/${householdId}/attachments/${preview.id}/download`}>
            {t('downloadOriginal')}
          </a>
        </Dialog>
      )}
    </section>
  );
}
