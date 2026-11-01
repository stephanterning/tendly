import { EditorState } from '@tiptap/pm/state';
import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Image from '@tiptap/extension-image';
import Mention from '@tiptap/extension-mention';
import { documentSchema, toDocument, safeLink, type TaskFields } from '@tendly/shared';
import { useTranslation } from 'react-i18next';
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
}: {
  value: TaskFields['description'];
  onValidityChange?: (valid: boolean) => void;
  onChange?: (value: TaskFields['description']) => void;
  label: string;
  members?: Member[];
  readOnly?: boolean;
  onUpload?: (files: File[]) => Promise<{ src: string; name: string; image: boolean }[]>;
}) {
  const { t } = useTranslation();
  const validity = useRef(onValidityChange);
  validity.current = onValidityChange;
  const change = useRef(onChange);
  change.current = onChange;
  const upload = useRef(onUpload);
  upload.current = onUpload;
  const memberRef = useRef(members);
  memberRef.current = members;
  const [link, setLink] = useState(''),
    [linkOpen, setLinkOpen] = useState(false),
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
      TaskItem.configure({ nested: true }),
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
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        if (!upload.current || !files.length) return false;
        event.preventDefault();
        void addFiles(files);
        return true;
      },
      handleDrop: (_view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (!upload.current || !files.length) return false;
        event.preventDefault();
        void addFiles(files);
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
  async function addFiles(files: File[]) {
    try {
      for (const file of (await upload.current?.(files)) ?? []) {
        if (file.image) editor?.chain().focus().setImage({ src: file.src, alt: file.name }).run();
        else
          editor
            ?.chain()
            .focus()
            .insertContent([
              {
                type: 'text',
                text: file.name,
                marks: [{ type: 'link', attrs: { href: file.src } }],
              },
              { type: 'text', text: ' ' },
            ])
            .run();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'operation_failed');
    }
  }
  useEffect(() => {
    if (!editor) return;
    const current = documentSchema.safeParse(editor.getJSON());
    const incoming = documentSchema.safeParse(toDocument(value));
    if (
      current.success &&
      incoming.success &&
      !editor.schema.nodeFromJSON(incoming.data).eq(editor.state.doc)
    ) {
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
    }
  }, [editor, value]);
  if (!editor) return null;
  const action = (name: string, run: () => void, active = false) => (
    <button type="button" aria-label={t(name)} aria-pressed={active} onClick={run}>
      {t(name)}
    </button>
  );
  return (
    <div className={'rich-editor' + (readOnly ? ' read-only' : '')}>
      {!readOnly && (
        <div className="rich-toolbar" role="group" aria-label={t('formatText')}>
          {action(
            'bold',
            () => {
              editor.chain().focus().toggleBold().run();
            },
            editor.isActive('bold'),
          )}
          {action(
            'italic',
            () => {
              editor.chain().focus().toggleItalic().run();
            },
            editor.isActive('italic'),
          )}
          {action(
            'heading',
            () => {
              editor.chain().focus().toggleHeading({ level: 2 }).run();
            },
            editor.isActive('heading'),
          )}
          {action(
            'bulletList',
            () => {
              editor.chain().focus().toggleBulletList().run();
            },
            editor.isActive('bulletList'),
          )}
          {action(
            'orderedList',
            () => {
              editor.chain().focus().toggleOrderedList().run();
            },
            editor.isActive('orderedList'),
          )}
          {action(
            'checklist',
            () => {
              editor.chain().focus().toggleTaskList().run();
            },
            editor.isActive('taskList'),
          )}
          {action(
            'quote',
            () => {
              editor.chain().focus().toggleBlockquote().run();
            },
            editor.isActive('blockquote'),
          )}
          {action(
            'codeBlock',
            () => {
              editor.chain().focus().toggleCodeBlock().run();
            },
            editor.isActive('codeBlock'),
          )}
          {action(
            'link',
            () => {
              setLinkOpen(!linkOpen);
              setLink(String(editor.getAttributes('link').href ?? ''));
            },
            editor.isActive('link'),
          )}
          {action('undo', () => {
            editor.chain().focus().undo().run();
          })}
          {action('redo', () => {
            editor.chain().focus().redo().run();
          })}
          {members.length > 0 && (
            <label className="mention-select">
              <span>@</span>
              <select
                aria-label={t('mentionMember')}
                value=""
                onChange={(e) => {
                  const m = members.find((m) => m.id === e.target.value);
                  if (m)
                    editor
                      .chain()
                      .focus()
                      .insertContent({
                        type: 'mention',
                        attrs: { id: m.id, label: m.name },
                      })
                      .run();
                }}
              >
                <option value="">{t('mentionMember')}</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {onUpload && (
            <label className="file-button">
              {t('attachFiles')}
              <input
                type="file"
                multiple
                onChange={(e) => {
                  void addFiles(Array.from(e.target.files ?? []));
                  e.target.value = '';
                }}
              />
            </label>
          )}
        </div>
      )}
      {linkOpen && (
        <div className="button-row">
          <label>
            {t('linkAddress')}
            <input value={link} onChange={(e) => setLink(e.target.value)} />
          </label>
          <button
            type="button"
            onClick={() => {
              if (!link) {
                editor.chain().focus().unsetLink().run();
                setLinkOpen(false);
              } else if (safeLink(link)) {
                editor.chain().focus().extendMarkRange('link').setLink({ href: link }).run();
                setLinkOpen(false);
              } else setError('invalid_link');
            }}
          >
            {t('save')}
          </button>
          <button type="button" onClick={() => setLinkOpen(false)}>
            {t('cancel')}
          </button>
        </div>
      )}
      <EditorContent editor={editor} />
      {error && <p role="alert">{t(error)}</p>}
    </div>
  );
}
