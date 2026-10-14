import { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Mention from '@tiptap/extension-mention';
import { readRichText } from '@tendly/shared';
import { useTranslation } from 'react-i18next';
import type { Member } from '../tasks/TaskFields.js';
export default function RichEditor({ value, onChange, members = [], label, upload, disabled = false }: { value: string; disabled?: boolean; onChange?: ((value: string) => void) | undefined; members?: Member[]; label: string; upload?: ((files: File[]) => Promise<string[]>) | undefined }) {
  const { t } = useTranslation(), callback = useRef(onChange), uploadRef = useRef(upload), membersRef = useRef(members);
  callback.current = onChange; uploadRef.current = upload; membersRef.current = members;
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: { openOnClick: !onChange, protocols: ['https', 'http', 'mailto'], HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' } } }), Image, TaskList, TaskItem.configure({ nested: true }), Mention.configure({
      suggestion: {
        items: ({ query }) => membersRef.current.filter(m => m.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).slice(0, 8),
        render: () => {
          let popup: HTMLDivElement | null = null;
          return {
            onStart: props => {
              popup = document.createElement('div'); popup.className = 'mention-menu'; popup.setAttribute('role', 'listbox'); document.body.append(popup);
              const render = () => {
                popup!.replaceChildren();
                for (const member of props.items) { const button = document.createElement('button'); button.type = 'button'; button.textContent = member.name; button.setAttribute('role', 'option'); button.addEventListener('mousedown', e => { e.preventDefault(); props.command({ id: member.id, label: member.name }); }); popup!.append(button); }
                const rect = props.clientRect?.(); if (rect) { popup!.style.left = Math.min(rect.left, window.innerWidth - 220) + 'px'; popup!.style.top = Math.min(rect.bottom + 4, window.innerHeight - 220) + 'px'; }
              }; render();
            },
            onUpdate: props => { if (!popup) return; popup.replaceChildren(); for (const member of props.items) { const button = document.createElement('button'); button.type = 'button'; button.textContent = member.name; button.setAttribute('role', 'option'); button.addEventListener('mousedown', e => { e.preventDefault(); props.command({ id: member.id, label: member.name }); }); popup.append(button); } },
            onKeyDown: ({ event }) => { if (event.key === 'Escape') { popup?.remove(); return true; } if (event.key === 'Enter' && popup?.firstElementChild) { popup.firstElementChild.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); return true; } return false; },
            onExit: () => { popup?.remove(); popup = null; },
          };
        },
      },
    })],
    content: readRichText(value), editable: !!onChange && !disabled,
    onUpdate: ({ editor }) => callback.current?.(JSON.stringify(editor.getJSON())),
    editorProps: { attributes: { role: 'textbox', 'aria-label': label, 'aria-multiline': 'true' }, handlePaste: (_view, event) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (!files.length || !uploadRef.current) return false;
      void uploadRef.current(files).then(urls => { for (const src of urls) editor?.chain().focus().setImage({ src }).run(); }); return true;
    }, handleDrop: (_view, event) => {
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (!files.length || !uploadRef.current) return false;
      void uploadRef.current(files).then(urls => { for (const src of urls) editor?.chain().focus().setImage({ src }).run(); }); return true;
    } },
  });
  useEffect(() => { if (editor && JSON.stringify(editor.getJSON()) !== value) editor.commands.setContent(readRichText(value), { emitUpdate: false }); }, [value, editor]);
  useEffect(() => { // Changing editability is UI state, not a document edit; do not restart autosave.
    editor?.setEditable(!!onChange && !disabled, false); }, [editor, onChange, disabled]);
  if (!editor) return null;
  const action = (name: string, run: () => void, active = false) => <button type="button" key={name} aria-label={t(name)} aria-pressed={active} onMouseDown={e => e.preventDefault()} onClick={run}>{t(name)}</button>;
  return <div className={'rich-editor ' + (!onChange ? 'rich-readonly' : '')}>
    {onChange && <div className="rich-toolbar" role="toolbar" aria-label={t('formatText')}>
      {action('bold', () => editor.chain().focus().toggleBold().run(), editor.isActive('bold'))}
      {action('italic', () => editor.chain().focus().toggleItalic().run(), editor.isActive('italic'))}
      {action('heading', () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive('heading'))}
      {action('bulletList', () => editor.chain().focus().toggleBulletList().run(), editor.isActive('bulletList'))}
      {action('numberedList', () => editor.chain().focus().toggleOrderedList().run(), editor.isActive('orderedList'))}
      {action('checklist', () => editor.chain().focus().toggleTaskList().run(), editor.isActive('taskList'))}
      {action('quote', () => editor.chain().focus().toggleBlockquote().run(), editor.isActive('blockquote'))}
      {action('codeBlock', () => editor.chain().focus().toggleCodeBlock().run(), editor.isActive('codeBlock'))}
      {action('link', () => { const href = window.prompt(t('linkAddress'), String(editor.getAttributes('link').href ?? 'https://')); if (href === '') editor.chain().focus().unsetLink().run(); else if (href && /^(https?:\/\/|mailto:)/i.test(href)) editor.chain().focus().setLink({ href }).run(); })}
      {!!members.length && <select aria-label={t('mentionPerson')} value="" onChange={e => { const member = members.find(m => m.id === e.target.value); if (member) editor.chain().focus().insertContent([{ type: 'mention', attrs: { id: member.id, label: member.name } }, { type: 'text', text: ' ' }]).run(); }}><option value="">@</option>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>}
    </div>}
    <EditorContent editor={editor} />
  </div>;
}
