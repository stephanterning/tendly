import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import type { FileUploader, UploadedFile } from './api.js';
import { UploadQueue } from './UploadQueue.js';
export function useUploads(upload: FileUploader, onBusyChange?: (busy: boolean) => void, onPendingChange?: (pending: boolean) => void) {
  const latest = useRef(upload);
  latest.current = upload;
  const [queue] = useState(() => new UploadQueue((...args) => latest.current(...args)));
  const entries = useSyncExternalStore(queue.subscribe, queue.getSnapshot);
  const busy = entries.some(entry => ['queued', 'uploading', 'processing'].includes(entry.state));
  const pending = entries.some(entry => entry.state !== 'done');
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => { onPendingChange?.(pending); }, [pending, onPendingChange]);
  useEffect(() => { queue.activate(); return () => queue.dispose(); }, [queue]);
  return { queue, busy, pending };
}
export function Uploads({ queue, insert }: { queue: UploadQueue; insert?: (file: UploadedFile) => void }) {
  const { t, i18n } = useTranslation();
  const entries = useSyncExternalStore(queue.subscribe, queue.getSnapshot);
  if (!entries.length) return null;
  const completed = entries.filter(entry => entry.state === 'done');
  return <section className="upload-status" aria-label={t('uploads')}>
    <ul>{entries.filter(entry => entry.state !== 'done').map(entry => <li key={entry.id}>
      <div className="upload-file"><strong>{entry.name}</strong><span role="status">
        {entry.state === 'failed' ? t(i18n.exists(entry.error ?? '') ? entry.error! : 'operation_failed') : t('upload_' + entry.state, { percent: entry.progress })}
      </span></div>
      {['uploading', 'processing'].includes(entry.state) && <progress max={100} value={entry.progress} aria-label={entry.name} />}
      <div className="upload-actions">
        {entry.state === 'failed' && <button type="button" onClick={() => queue.retry(entry.id)}>{t('retry')}</button>}
        {entry.state === 'unplaced' && insert && <button type="button" onClick={() => { insert(entry.result!); queue.placed(entry.id); }}>{t('insertHere')}</button>}
        {!['uploading', 'processing'].includes(entry.state) && <button type="button" aria-label={`${t('dismissUpload')} ${entry.name}`} onClick={() => queue.remove(entry.id)}>{t('dismissUpload')}</button>}
      </div>
    </li>)}</ul>
    {completed.length > 0 && <div className="upload-completed">
      <details><summary>{t('uploadsComplete', { count: completed.length })}</summary>
        <ul>{completed.map(entry => <li key={entry.id}>{entry.name}</li>)}</ul>
      </details>
      <button type="button" onClick={() => { for (const entry of completed) queue.remove(entry.id); }}>{t('clearCompletedUploads')}</button>
    </div>}
  </section>;
}
