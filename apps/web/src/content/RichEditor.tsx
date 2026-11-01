import { SearchHighlight, searchHighlightKey } from './searchHighlight.js';
import { EditorState } from '@tiptap/pm/state';
import { useEffect, useRef, useState } from 'react';
import { useEditor, useEditorState, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Image from '@tiptap/extension-image';
import Mention from '@tiptap/extension-mention';
import { documentSchema, toDocument, safeLink, type TaskFields } from '@tendly/shared';
import { useTranslation } from 'react-i18next';
import { ImagePlus, Link, ListChecks, ChevronDown, Expand, Bold, Italic } from 'lucide-react';
import { Dialog } from '../components/ui/dialog.js';
import { LinkDialog } from './LinkDialog.js';
import { ImagePlacements, addPlacements, imagePlacements, insertUploadedFile, removePlacement } from './imagePlacement.js';
import { Uploads, useUploads } from './Uploads.js';
import type { FileUploader, UploadedFile } from './api.js';
import type { Member } from '../tasks/TaskFields.js';
const SafeImage = Image.extend({
  parseHTML() {
    return [
      {
        tag: 'img[src]',
        getAttrs: (element) =>
          /^\/api\/v1\/households\/[0-9a-f-]{36}\/attachments\/[0-9a-f-]{36}\/preview$/.test(
            element.getAttribute('src') ?? '',
          )
            ? null
            : false,
      },
    ];
  },
});
export function RichEditor({
  value,
  onChange,
  label,
  members = [],
  readOnly = false,
  onUpload,
  onValidityChange,
  onBusyChange,
  onPendingChange,
  insertion,
  documentMode = false,
  searchMatch = '',
}: {
  value: TaskFields['description'];
  searchMatch?: string;
  documentMode?: boolean;
  onValidityChange?: (valid: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
  onPendingChange?: (pending: boolean) => void;
  insertion?: { file: UploadedFile } | undefined;
  onChange?: (value: TaskFields['description']) => void;
  label: string;
  members?: Member[];
  readOnly?: boolean;
  onUpload?: FileUploader;
}) {
  const { t } = useTranslation();
  const [imagePreview, setImagePreview] = useState<{ src: string; name: string } | null>(null);
  const uploads = useUploads((...args) => {
    if (!upload.current) return Promise.reject(new Error('operation_failed'));
    return upload.current(...args);
  }, onBusyChange, onPendingChange);
  const validity = useRef(onValidityChange);
  validity.current = onValidityChange;
  const change = useRef(onChange);
  change.current = onChange;
  const upload = useRef(onUpload);
  upload.current = onUpload;
  const memberRef = useRef(members);
  memberRef.current = members;
  const [linkOpen, setLinkOpen] = useState(false),
    [error, setError] = useState('');
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: readOnly,
          autolink: true,
          isAllowedUri: (url) => safeLink(url),
        },
      }),
      TaskList,
      ImagePlacements,
      SearchHighlight,
      TaskItem.configure({ nested: true, a11y: { checkboxLabel: node => node.firstChild?.textContent || t('emptyChecklistItem') } }),
      SafeImage.configure({ allowBase64: false }),
      Mention.configure({
        HTMLAttributes: { class: 'mention' },
        suggestion: {
          items: ({ query }) =>
            memberRef.current
              .filter((m) => m.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
              .slice(0, 8),
          render: () => {
            let box: HTMLDivElement | undefined,
              selected = 0;
            let choose: (id: number) => void = () => {};
            const render = (props: {
              items: Member[];
              command: (value: { id: string; label: string }) => void;
              editor: { view: { dom: HTMLElement } };
            }) => {
              box ??= document.createElement('div');
              box.className = 'mention-options';
              box.setAttribute('role', 'listbox');
              box.replaceChildren();
              selected = 0;
              choose = (i) => {
                const m = props.items[i];
                if (m) props.command({ id: m.id, label: m.name });
              };
              props.items.forEach((m, i) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.textContent = m.name;
                b.setAttribute('role', 'option');
                b.onmousedown = (e) => e.preventDefault();
                b.onclick = () => choose(i);
                box!.append(b);
              });
              props.editor.view.dom.parentElement?.append(box);
            };
            return {
              onStart: render,
              onUpdate: render,
              onExit: () => {
                box?.remove();
                box = undefined;
              },
              onKeyDown: ({ event }: { event: KeyboardEvent }) => {
                if (event.key === 'Escape') {
                  box?.remove();
                  return true;
                }
                if (event.key === 'Enter') {
                  choose(selected);
                  return true;
                }
                if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
                  const count = box?.children.length ?? 0;
                  selected =
                    (selected + (event.key === 'ArrowDown' ? 1 : -1) + count) % Math.max(1, count);
                  Array.from(box?.children ?? []).forEach((el, i) =>
                    el.setAttribute('aria-selected', String(i === selected)),
                  );
                  return true;
                }
                return false;
              },
            };
          },
        },
      }),
    ],
    content: toDocument(value),
    editable: !readOnly,
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-label': label,
        'aria-multiline': 'true',
        'aria-readonly': String(readOnly),
        'data-placeholder': t('descriptionPrompt'),
      },
      handleClick: (view, pos, event) => {
        const anchor = event.target instanceof Element ? event.target.closest('a') : null;
        if (readOnly || !anchor || !view.dom.contains(anchor)) return false;
        event.preventDefault();
        editor?.chain().setTextSelection(pos).extendMarkRange('link').run();
        setLinkOpen(true);
        return true;
      },
      handleKeyDown: (_view, event) => {
        if (!readOnly && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
          event.preventDefault();
          setLinkOpen(true);
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        if (!upload.current || !files.length) return false;
        event.preventDefault();
        void addFiles(files);
        return true;
      },
      handleDrop: (view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (!upload.current || !files.length) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        addFiles(files, pos);
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      try {
        change.current?.(documentSchema.parse(editor.getJSON()));
        setError('');
        validity.current?.(true);
      } catch {
        validity.current?.(false);
        setError('content_invalid');
      }
    },
  });
  useEffect(() => {
    if (!editor) return;
    editor.view.dispatch(editor.state.tr.setMeta(searchHighlightKey, searchMatch).setMeta('addToHistory', false));
    if (!searchMatch || !documentMode) return;
    const frame = requestAnimationFrame(() => editor.view.dom.querySelector('.search-match')?.scrollIntoView({ block: 'center' }));
    return () => cancelAnimationFrame(frame);
  }, [editor, searchMatch, documentMode]);
  function addFiles(files: File[], position = editor?.state.selection.from) {
    if (!editor || position === undefined || !files.length || readOnly) return;
    const anchors = files.map(file => ({ id: crypto.randomUUID(), name: file.name, pos: position }));
    addPlacements(editor, anchors);
    files.forEach((file, index) => {
      const id = anchors[index]!.id;
      uploads.queue.add(id, file, result => insertUploadedFile(editor, result, id), () => removePlacement(editor, id));
    });
  }
  useEffect(() => {
    if (editor && insertion) insertUploadedFile(editor, insertion.file);
  }, [editor, insertion]);
  useEffect(() => {
    if (!editor) return;
    const current = documentSchema.safeParse(editor.getJSON());
    const incoming = documentSchema.safeParse(toDocument(value));
    if (
      current.success &&
      incoming.success &&
      !editor.schema.nodeFromJSON(incoming.data).eq(editor.state.doc)
    ) {
      setLinkOpen(false);
      editor.view.dispatch(editor.state.tr.setMeta(imagePlacements, { clear: true }));
      editor.commands.setContent(toDocument(incoming.data), {
        emitUpdate: false,
      });
      // Remote replacement must not enter local Undo history and later overwrite
      // another person's saved content. Local typing preserves its history.
      editor.view.updateState(
        EditorState.create({
          schema: editor.schema,
          doc: editor.state.doc,
          selection: editor.state.selection,
          plugins: editor.state.plugins,
        }),
      );
      editor.view.dispatch(editor.state.tr.setMeta(searchHighlightKey, searchMatch).setMeta('addToHistory', false));
    }
  }, [editor, value]);
  const controls = useEditorState({ editor, selector: ({ editor: current }) => current ? {
    empty: current.isEmpty,
    bold: current.isActive('bold'), italic: current.isActive('italic'),
    taskList: current.isActive('taskList'), link: current.isActive('link'), image: current.isActive('image'),
    heading: current.isActive('heading'), bulletList: current.isActive('bulletList'),
    orderedList: current.isActive('orderedList'), blockquote: current.isActive('blockquote'),
    codeBlock: current.isActive('codeBlock'),
    canUndo: current.can().undo(), canRedo: current.can().redo(),
  } : null });
  if (!editor || !controls) return null;
  const action = (name: string, run: () => void, active?: boolean) => (
    <button type="button" aria-label={t(name)} aria-pressed={active} onMouseDown={event => event.preventDefault()} onClick={run}>
      {t(name)}
    </button>
  );
  return (
    <div className={'rich-editor' + (readOnly ? ' read-only' : '') + (documentMode ? ' document-editor' : '')}
      data-empty={controls.empty}
      onClick={event => {
        const image = event.target;
        if (image instanceof HTMLImageElement && image.closest('.tiptap'))
          setImagePreview({ src: image.getAttribute('src') ?? '', name: image.alt || t('image') });
      }}>
      {!readOnly && (
        <div className="rich-toolbar" role="group" aria-label={t('formatText')}>
          <button type="button" className="rich-icon-tool" aria-label={t('bold')} title={t('bold')} aria-pressed={controls.bold}
            onMouseDown={event => event.preventDefault()} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={18} /></button>
          <button type="button" className="rich-icon-tool" aria-label={t('italic')} title={t('italic')} aria-pressed={controls.italic}
            onMouseDown={event => event.preventDefault()} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={18} /></button>
          <button type="button" aria-label={t('checklist')} title={t('checklist')} aria-pressed={controls.taskList}
            onMouseDown={event => event.preventDefault()}
            onClick={() => editor.chain().focus().toggleTaskList().run()}><ListChecks size={17} /><span className="rich-tool-label">{t('checklist')}</span></button>
          {onUpload && <label className="file-button rich-image-button" title={t('insertImage')}><ImagePlus size={17} /><span className="rich-tool-label">{t('image')}</span>
            <input type="file" multiple accept="image/*,.heic,.heif" aria-label={t('insertImage')}
              onChange={event => { void addFiles(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
          </label>}
          <button type="button" aria-label={t('link')} title={t('link')} aria-pressed={controls.link} aria-keyshortcuts="Control+k Meta+k"
            onMouseDown={event => event.preventDefault()} onClick={() => setLinkOpen(true)}><Link size={17} /><span className="rich-tool-label">{t('link')}</span></button>
          <details className="rich-more">
            <summary aria-label={t('moreFormatting')}>Aa <ChevronDown size={15} /></summary>
            <div className="rich-more-tools">
              {action('heading', () => { editor.chain().focus().toggleHeading({ level: 2 }).run(); }, controls.heading)}
              {action('bulletList', () => { editor.chain().focus().toggleBulletList().run(); }, controls.bulletList)}
              {action('orderedList', () => { editor.chain().focus().toggleOrderedList().run(); }, controls.orderedList)}
              {action('quote', () => { editor.chain().focus().toggleBlockquote().run(); }, controls.blockquote)}
              {action('codeBlock', () => { editor.chain().focus().toggleCodeBlock().run(); }, controls.codeBlock)}
              <button type="button" disabled={!controls.canUndo} onMouseDown={event => event.preventDefault()} onClick={() => editor.chain().focus().undo().run()}>{t('undo')}</button>
              <button type="button" disabled={!controls.canRedo} onMouseDown={event => event.preventDefault()} onClick={() => editor.chain().focus().redo().run()}>{t('redo')}</button>
              {members.length > 0 && <label className="mention-select"><span>@</span>
                <select aria-label={t('mentionMember')} value="" onChange={event => {
                  const member = members.find(m => m.id === event.target.value);
                  if (member) editor.chain().focus().insertContent({ type: 'mention', attrs: { id: member.id, label: member.name } }).run();
                }}>
                  <option value="">{t('mentionMember')}</option>
                  {members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
                </select>
              </label>}
              {onUpload && <label className="file-button">{t('attachFiles')}
                <input type="file" multiple onChange={event => { void addFiles(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
              </label>}
            </div>
          </details>
          {controls.image && <button type="button" onClick={() => {
            const attrs = editor.getAttributes('image');
            setImagePreview({ src: String(attrs.src), name: String(attrs.alt || t('image')) });
          }}><Expand size={17} />{t('enlargeImage')}</button>}
        </div>
      )}
      {linkOpen && <LinkDialog editor={editor} onClose={() => setLinkOpen(false)} />}
      <EditorContent editor={editor} />
      {!readOnly && <Uploads queue={uploads.queue} insert={file => { insertUploadedFile(editor, file); }} />}
      {documentMode && <p className="small muted image-retention-note">{t('inlineImageRetention')}</p>}
      {error && <p role="alert">{t(error)}</p>}
      {imagePreview && <Dialog open title={imagePreview.name} className="image-preview-dialog" onOpenChange={open => { if (!open) setImagePreview(null); }}>
        <img className="file-preview" src={imagePreview.src} alt={imagePreview.name} />
        <div className="button-row">
          <a href={imagePreview.src.replace(/\/preview$/, '/download')}>{t('downloadOriginal')}</a>
          {!readOnly && controls.image && editor.getAttributes('image').src === imagePreview.src && <button type="button" onClick={() => {
            editor.commands.deleteSelection();
            setImagePreview(null);
          }}>{t('removeInlineImage')}</button>}
        </div>
        {!readOnly && <p className="small muted">{t('inlineImageRetention')}</p>}
      </Dialog>}
    </div>
  );
}
