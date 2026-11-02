import { useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { safeLink } from '@tendly/shared';
import { ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '../components/ui/dialog.js';

export function LinkDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const { t } = useTranslation();
  const [original] = useState(() => String(editor.getAttributes('link').href ?? ''));
  const [address, setAddress] = useState(original);
  const [invalid, setInvalid] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  function save() {
    const href = address.trim();
    if (!href || !safeLink(href)) { setInvalid(true); return; }
    if (editor.state.selection.empty && !editor.isActive('link'))
      editor.chain().insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }).run();
    else editor.chain().extendMarkRange('link').setLink({ href }).run();
    onClose();
  }
  return <Dialog open title={t(original ? 'editLink' : 'insertLink')} onOpenChange={open => { if (!open) onClose(); }}
    onInitialFocus={() => input.current?.focus()}
    onReturnFocus={() => { editor.commands.focus(undefined, { scrollIntoView: false }); }}>
    <div className="rich-link-form">
      {original && safeLink(original) && <a className="rich-link-open" href={original} target="_blank" rel="noopener noreferrer">
        <ExternalLink size={18} /><span>{t('openLink')}<small>{original}</small></span>
      </a>}
      <label>{t('linkAddress')}
        <input ref={input} type="url" value={address} aria-invalid={invalid}
          onChange={event => { setAddress(event.target.value); setInvalid(false); }}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); save(); } }} />
      </label>
      {invalid && <p role="alert">{t('invalid_link')}</p>}
      <div className="button-row">
        <button type="button" className="primary" onClick={save}>{t('save')}</button>
        <button type="button" onClick={onClose}>{t('cancel')}</button>
        {original && <button type="button" onClick={() => {
          editor.chain().extendMarkRange('link').unsetLink().run();
          onClose();
        }}>{t('removeLink')}</button>}
      </div>
    </div>
  </Dialog>;
}
