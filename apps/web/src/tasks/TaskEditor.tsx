import { useNavigationGuard } from '../navigation/Navigation.js';
import { ContentPanel } from '../content/ContentPanel.js';
import { RichEditor } from '../content/RichEditor.js';
import { uploadFile, type UploadedFile } from '../content/api.js';
import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Maximize2, Minimize2, Link } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { plainText, taskFields, type Task, type TaskChanges, type Entity } from '@tendly/shared';
import { Dialog } from '../components/ui/dialog.js';
import { TaskFields, type Member } from './TaskFields.js';
import { loadTask } from './api.js';
import { TaskDraft, draftStorage, isDirty, type DraftBackup } from './draft.js';

export function TaskEditor({ userId, task, entities, members, timezone, onSave, onRefresh, onClose, onReturnFocus, searchMatch, commentId }: {
  userId: string; task: Task; entities: Entity[]; members: Member[]; timezone: string;
  onRefresh: (task: Task) => void;
  onSave: (base: Task, changes: TaskChanges, confirm?: boolean) => Promise<Task>;
  onClose: () => void; onReturnFocus: () => void; searchMatch: string; commentId: string;
}) {
  const { t } = useTranslation();
  const queries = useQueryClient();
  const planningId = useId();
  const [titleElement, setTitleElement] = useState<HTMLTextAreaElement | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [planningOpen, setPlanningOpen] = useState(false);
  const [wideScreen, setWideScreen] = useState(() => window.matchMedia('(min-width: 1100px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1100px)');
    const update = () => setWideScreen(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const callbacks = useRef({ onSave, onRefresh });
  callbacks.current = { onSave, onRefresh };
  const [editor] = useState(() => {
    let storage: ReturnType<typeof draftStorage> | undefined;
    let backup: DraftBackup | undefined;
    let storageFailed = false;
    try { storage = draftStorage(userId, task, sessionStorage); backup = storage.read(); }
    catch { storageFailed = true; }
    return new TaskDraft(task, {
      save: (base, changes, confirm) => callbacks.current.onSave(base, changes, confirm),
      load: async () => {
        const latest = await loadTask(task.householdId, task.id);
        callbacks.current.onRefresh(latest);
        return latest;
      },
      backup: value => { if (!storage) throw new Error('storage unavailable'); storage.write(value); },
    }, backup, storageFailed);
  });
  const state = useSyncExternalStore(editor.subscribe, editor.getSnapshot);
  const { draft, failure } = state;
  const dirty = isDirty(state);
  const [contentValid, setContentValid] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [descriptionPending, setDescriptionPending] = useState(false);
  const [panelPending, setPanelPending] = useState(false);
  const [insertion, setInsertion] = useState<{ file: UploadedFile }>();
  const [contentBusy, setContentBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [copied, setCopied] = useState('');
  const closeRequest = useRef(0);
  const busyContent = uploading || contentBusy;
  const pendingContent = busyContent || descriptionPending || panelPending;
  const contentState = useRef({ busyContent: pendingContent, contentValid });
  contentState.current = { busyContent: pendingContent, contentValid };
  const parse = taskFields.safeParse(draft);
  const invalidFields = parse.success ? [] : parse.error.issues.map(issue => String(issue.path[0]));
  const titleInvalid = invalidFields.includes('title');
  const pinnedPlanning = expanded && wideScreen;
  const showPlanning = pinnedPlanning || planningOpen || invalidFields.some(field => field !== 'title' && field !== 'description');
  const epic = entities.find(entity => entity.id === draft.epicId);
  const planningSummary = [t('column_' + draft.column), draft.size, epic?.name, draft.high ? t('high') : null,
    draft.deadlineDate ? `${t('deadlineDate')}: ${draft.deadlineDate}` : null].filter(Boolean).join(' · ');
  useLayoutEffect(() => {
    const title = titleElement;
    if (title) { title.style.height = 'auto'; title.style.height = title.scrollHeight + 2 + 'px'; }
  }, [draft.title, expanded, wideScreen, titleElement]);
  useEffect(() => {
    const title = titleElement;
    if (!title) return;
    let width = 0, frame = 0;
    const resize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { title.style.height = 'auto'; title.style.height = title.scrollHeight + 2 + 'px'; });
    };
    const observer = new ResizeObserver(([entry]) => {
      if (!entry || entry.contentRect.width === width) return;
      width = entry.contentRect.width;
      resize();
    });
    observer.observe(title);
    window.addEventListener('resize', resize);
    return () => { observer.disconnect(); window.removeEventListener('resize', resize); cancelAnimationFrame(frame); };
  }, [titleElement]);
  async function uploadDescription(file: File, id: string, progress: (percent: number) => void) {
    try { return await uploadFile(task.householdId, task.id, file, id, progress); }
    finally { void queries.invalidateQueries({ queryKey: ['planning', task.householdId, 'attachments', task.id] }); }
  }

  useEffect(() => editor.receive(task), [editor, task, state]);
  useEffect(() => {
    if (!dirty || state.busy || failure || state.restored || !contentValid || leaving) return;
    const timer = window.setTimeout(() => void editor.flush(), 650);
    return () => window.clearTimeout(timer);
  }, [editor, state, dirty, failure, contentValid, busyContent, leaving]);
  useEffect(() => {
    if (!dirty && !state.busy && !state.uncertain && contentValid && !pendingContent) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, state.busy, state.uncertain, contentValid, pendingContent]);
  useEffect(() => () => { closeRequest.current++; }, []);

  const leaveAction = useRef(onClose);
  useNavigationGuard(next => { leaveAction.current = next; void requestClose(); });
  async function requestClose() {
    const request = ++closeRequest.current;
    if (!contentValid || pendingContent || state.restored) { setLeaving(true); return; }
    setClosing(true);
    const saved = await editor.flush();
    setClosing(false);
    if (request !== closeRequest.current) return;
    if (saved && !contentState.current.busyContent && contentState.current.contentValid) leaveAction.current(); else setLeaving(true);
  }
  async function retry() {
    if (busyContent || !contentValid) return;
    await editor.flush({ retry: true, confirm: failure?.message === 'confirm_unavailable' });
  }
  async function copyDescription(value: Task['description']) {
    try { await navigator.clipboard.writeText(plainText(value)); setCopied(t('draftCopied')); }
    catch { setCopied(t('copyDraftManually')); }
  }
  const labelFor = (field: string) => t(field === 'epicId' ? 'epic' : field);
  const fieldText = (value: typeof draft, field: string) => {
    const fieldValue = value[field as keyof typeof draft];
    if (field === 'column') return t('column_' + value.column);
    if (field === 'high') return value.high ? t('high') : t('none');
    if (field === 'epicId') return entities.find(entity => entity.id === value.epicId)?.name ?? t('noEpic');
    if (Array.isArray(fieldValue)) return fieldValue.map(id =>
      members.find(member => member.id === id)?.name ?? entities.find(entity => entity.id === id)?.name ?? t('unavailable')).join(', ') || t('none');
    return fieldValue === null ? t('none') : String(fieldValue);
  };
  const conflictFields = failure?.fields ?? [];
  const status = !busyContent && pendingContent ? 'uploadsNeedAttention' : busyContent ? 'contentBusy' : state.busy ? (state.uncertain && failure ? 'checkingSave' : 'saving')
    : !contentValid || failure ? 'taskSaveFailed' : state.restored ? 'draftRestored' : dirty ? 'unsavedChanges' : 'taskSaved';
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }} title={t('taskDetails')} sheet mobileBack onReturnFocus={onReturnFocus}
    className={'task-detail' + (expanded ? ' task-detail-expanded' : '')}
    headerContent={<>
      <button className="icon-button quiet" aria-label={t('copyTaskLink')} title={t('copyTaskLink')} onClick={() => {
        void navigator.clipboard.writeText(location.href).then(() => setCopied(t('linkCopied')), () => setCopied(t('copyLinkFailed')));
      }}><Link size={18} /></button>
      <p className="save-status small muted" role="status">{t(status)}</p>
      <button className="icon-button quiet task-expand" aria-label={t(expanded ? 'compactTask' : 'expandTask')}
        title={t(expanded ? 'compactTask' : 'expandTask')} onClick={() => setExpanded(!expanded)}>
        {expanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
      </button>
    </>}>
    {copied && <p role="status">{copied}</p>}
    {state.storageFailed && <p className="alert error" role="alert">{t('draftStorageFailed')}</p>}
    {state.restored && <div className="alert" role="status"><p>{t('draftRestoredHelp')}</p><button disabled={state.busy || busyContent} onClick={() => void retry()}>{t('resumeDraft')}</button></div>}
    {failure && <div className="alert error" role="alert">
      <p>{t(failure.message === 'task_conflict' ? 'conflictReview' : failure.message === 'invalid_input' ? 'fixInvalidFields' : failure.message)}</p>
      {failure.current ? <>
        <p>{conflictFields.map(labelFor).join(', ')}</p>
        <div className="conflict-comparison">
          {([['myDraft', draft], ['latestSaved', failure.current]] as const).map(([label, value]) => <section key={label} aria-label={t(label)}>
            <h3>{t(label)}</h3>
            {conflictFields.map(field => field === 'description' ? <div key={field}>
              <RichEditor readOnly value={value.description} label={t(label) + ' · ' + t('description')} />
              <button onClick={() => void copyDescription(value.description)}>{t('copyDescription')}</button>
            </div> : <p key={field}><strong>{labelFor(field)}: </strong>{fieldText(value, field)}</p>)}
          </section>)}
        </div>
        <p className="small">{t('conflictEditHelp')}</p>
        <div className="button-row">
          <button disabled={state.busy || busyContent || !contentValid} onClick={() => { editor.resolve(false); setCopied(''); }}>{t('useLatest')}</button>
          <button disabled={state.busy || busyContent || !contentValid} onClick={() => { editor.resolve(true); setCopied(''); void editor.flush(); }}>{t('keepMine')}</button>
        </div>
        {copied && <p role="status">{copied}</p>}
      </> : <button disabled={state.busy || busyContent || !contentValid} onClick={() => void retry()}>{t(failure.message === 'confirm_unavailable' ? 'startAnyway' : 'retry')}</button>}
    </div>}
    <fieldset disabled={closing} className="task-title-section">
      <label className="sr-only" htmlFor="task-title">{t('taskTitle')}</label>
      <textarea ref={setTitleElement} id="task-title" className="task-title-input" rows={1} maxLength={300} value={draft.title}
        aria-invalid={titleInvalid} aria-describedby={titleInvalid ? 'task-title-error' : undefined}
        onChange={e => editor.edit({ title: e.target.value })} />
      {titleInvalid && <p id="task-title-error" className="field-error" role="alert">{t('titleRequired')}</p>}
    </fieldset>
    <div className="task-detail-body">
      <section className="task-planning" aria-label={t('taskPlanning')}>
        {pinnedPlanning ? <h3>{t('taskPlanning')}</h3> : <button className="planning-toggle quiet" aria-expanded={showPlanning} aria-controls={planningId}
          onClick={() => setPlanningOpen(!planningOpen)}>
          <span>{planningSummary}</span><span className="planning-toggle-label">{t('taskPlanning')}<ChevronDown size={16} /></span>
        </button>}
        <fieldset id={planningId} hidden={!showPlanning} disabled={closing}>
          <TaskFields value={draft} onChange={changes => editor.edit(changes)} entities={entities} members={members} timezone={timezone}
            invalidFields={invalidFields} showDescription={false} />
        </fieldset>
      </section>
      <div className="task-document-column">
        <fieldset disabled={closing} className="task-description">
          <h3>{t('description')}</h3>
          <RichEditor documentMode searchMatch={commentId ? '' : searchMatch} value={draft.description} onChange={description => editor.edit({ description })}
            label={t('description')} members={members} onValidityChange={setContentValid} onBusyChange={setUploading} onPendingChange={setDescriptionPending} insertion={insertion} onUpload={uploadDescription} />
        </fieldset>
        <ContentPanel commentId={commentId} searchMatch={searchMatch} householdId={task.householdId} taskId={task.id} userId={userId} members={members} onBusyChange={setContentBusy} onPendingChange={setPanelPending} onInsert={file => setInsertion({ file })} />
      </div>
    </div>
    {leaving && <Dialog open onOpenChange={open => { if (!open) { closeRequest.current++; setLeaving(false); } }} title={t('unsavedChanges')}>
      <p>{t(pendingContent ? 'waitForContent' : state.uncertain ? 'saveOutcomeUnknown' : 'leaveDraftHelp')}</p>
      <div className="button-row">
        <button className="primary" onClick={() => { closeRequest.current++; setLeaving(false); }}>{t('continueEditing')}</button>
        <button disabled={state.busy || pendingContent || !contentValid || state.storageFailed}
          onClick={() => leaveAction.current()}>{t('keepDraftAndClose')}</button>
        <button disabled={state.busy || pendingContent || !!state.uncertain}
          onClick={() => { if (editor.discard()) leaveAction.current(); }}>{t('discardDraft')}</button>
      </div>
    </Dialog>}
  </Dialog>;
}
