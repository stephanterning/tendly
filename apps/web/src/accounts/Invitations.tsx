import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Mail, Ticket } from 'lucide-react';
import { api, result } from './api.js';

export function InvitationCodeEntry({ onUse }: { onUse: (code: string) => void }) {
  const { t } = useTranslation();
  return <section className="code-entry">
    <h3 className="icon-label"><Ticket size={18} aria-hidden="true" />{t('haveInvitationCode')}</h3>
    <form onSubmit={(event) => {
      event.preventDefault();
      onUse(String(new FormData(event.currentTarget).get('invitationCode')).trim());
    }}>
      <label>{t('invitationCode')}<input name="invitationCode" type="text" autoComplete="one-time-code" autoCapitalize="none" autoCorrect="off" spellCheck={false} minLength={20} maxLength={128} required /></label>
      <button type="submit">{t('useInvitationCode')}</button>
    </form>
  </section>;
}
type Run = (action: () => Promise<unknown>, message?: string) => Promise<void>;
export function InvitePanel({ householdId, run, busy }: { householdId: string; run: Run; busy: boolean }) {
  const { t } = useTranslation();
  const [invitation, setInvitation] = useState<{ code: string; expiresAt: string; email: string } | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [copyState, setCopyState] = useState('');
  const codeField = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!invitation) return;
    const tick = () => setRemaining(Math.max(0, Math.ceil((Date.parse(invitation.expiresAt) - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [invitation]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body = { email: String(data.get('email')), role: data.get('role') as 'admin' | 'member' };
    const code = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'code';
    setInvitation(null); setCopyState('');
    void run(async () => {
      if (code) {
        const created = await result(api.POST('/api/v1/households/{id}/invitation-codes', { params: { path: { id: householdId } }, body }));
        setRemaining(Math.max(0, Math.ceil((Date.parse(created.expiresAt) - Date.now()) / 1000)));
        setInvitation({ ...created, email: body.email });
      } else {
        await result(api.POST('/api/v1/households/{id}/invitations', { params: { path: { id: householdId } }, body }));
      }
    }, code ? '' : 'emailSent');
  }
  async function copy() {
    if (!invitation || Date.parse(invitation.expiresAt) <= Date.now()) { setRemaining(0); return; }
    try { await navigator.clipboard.writeText(invitation.code); setCopyState('codeCopied'); }
    catch { codeField.current?.select(); setCopyState('copyCodeManually'); }
  }
  return <section className="panel">
    <h2>{t('invite')}</h2><p className="muted">{t('inviteText')}</p>
    <form onSubmit={submit}><fieldset disabled={busy}>
      <label>{t('email')}<input name="email" type="email" required /></label>
      <label>{t('role')}<select name="role" defaultValue="member"><option value="member">{t('member')}</option><option value="admin">{t('admin')}</option></select></label>
      <div className="button-row">
        <button className="primary" type="submit" value="email"><Mail size={17} />{t('sendInvite')}</button>
        <button type="submit" value="code"><Copy size={17} />{t('createInvitationCode')}</button>
      </div>
      <p className="small muted">{t('invitationCodeHelp')}</p>
    </fieldset></form>
    {invitation && <div className="invitation-code">
      <p>{t('codeFor', { email: invitation.email })}</p>
      {remaining > 0 ? <>
        <label>{t('invitationCode')}<input ref={codeField} readOnly value={invitation.code} autoComplete="off" spellCheck={false} onFocus={(event) => event.currentTarget.select()} /></label>
        <button onClick={() => void copy()}><Copy size={17} />{t('copyInvitationCode')}</button>
        <p className="small muted" role="timer">{t('codeExpires', { time: Math.floor(remaining / 60) + ':' + String(remaining % 60).padStart(2, '0') })}</p>
        {copyState && <p role="status">{t(copyState)}</p>}
      </> : <p role="status">{t('invitationCodeExpired')}</p>}
    </div>}
  </section>;
}
