import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { browserSupportsWebAuthn, startAuthentication, startRegistration, type PublicKeyCredentialCreationOptionsJSON, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { Fingerprint, ArrowLeft, Mail, House } from 'lucide-react';
import type { RegistrationInput } from '@tendly/shared';
import { api, result } from './api.js';

export async function signIn() {
  const challenge = await result(api.POST('/api/v1/auth/login/options', { body: {} }));
  const response = await startAuthentication({ optionsJSON: challenge.options as unknown as PublicKeyCredentialRequestOptionsJSON });
  await result(api.POST('/api/v1/auth/login/verify', { body: { ceremonyId: challenge.ceremonyId, response: { ...response }, name: 'Passkey' } }));
}
export async function enroll(input: RegistrationInput, name = 'Passkey') {
  const body = input.flow === 'bootstrap' || input.flow === 'invite' ? { ...input, language: input.language ?? 'en' } : input;
  const challenge = await result(api.POST('/api/v1/auth/register/options', { body }));
  const response = await startRegistration({ optionsJSON: challenge.options as unknown as PublicKeyCredentialCreationOptionsJSON });
  await result(api.POST('/api/v1/auth/register/verify', { body: { ceremonyId: challenge.ceremonyId, response: { ...response }, name } }));
}
export type EntryLink = { purpose: string; token: string } | null;
export function errorKey(error: unknown) {
  if (error instanceof Error) return ['NotAllowedError', 'AbortError'].includes(error.name) || error.name === 'WebAuthnError' ? 'passkey_cancelled' : error.message;
  return 'operation_failed';
}
export function Auth({ initialized, emailAvailable, link, refresh, clearLink }: { initialized: boolean; emailAvailable: boolean; link: EntryLink; refresh: () => Promise<void>; clearLink: () => void }) {
  const { t, i18n } = useTranslation();
  const [recover, setRecover] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const supported = browserSupportsWebAuthn();
  const setup = !initialized && !link;
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (error) { const key = errorKey(error); setError(i18n.exists(key) ? key : 'operation_failed'); }
    finally { setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = (name: string) => String(data.get(name) ?? '');
    void run(async () => {
      if (recover) {
        await result(api.POST('/api/v1/auth/recovery', { body: { email: value('email') } }));
        setNotice('recoverySent'); return;
      }
      if (setup) await enroll({ flow: 'bootstrap', language: i18n.language === 'sv' ? 'sv' : 'en', token: value('token').trim(), email: value('email'), name: value('name'), householdName: value('household'), timezone: value('timezone') });
      else if (link?.purpose === 'invite') await enroll({ flow: 'invite', language: i18n.language === 'sv' ? 'sv' : 'en', token: link.token, name: value('name') });
      else if (link?.purpose === 'recovery') await enroll({ flow: 'recovery', token: link.token });
      else if (link?.purpose === 'verify_email') {
        await result(api.POST('/api/v1/auth/verify-email', { body: { token: link.token } }));
        clearLink(); setNotice('verified'); await refresh(); return;
      } else await signIn();
      clearLink(); await refresh();
    });
  }
  const title = setup ? 'setup' : recover ? 'recoverTitle' : link?.purpose === 'invite' ? 'invitation' : link?.purpose === 'recovery' ? 'newPasskey' : link?.purpose === 'verify_email' ? 'verify' : 'welcome';
  const action = setup ? 'create' : recover ? 'sendRecovery' : link?.purpose === 'invite' ? 'join' : link?.purpose === 'recovery' ? 'newPasskey' : link?.purpose === 'verify_email' ? 'verify' : 'signIn';
  return <main className="auth-layout">
    <div className="brand"><House size={23} aria-hidden="true" /> Tendly</div>
    <section className="auth-card" aria-labelledby="auth-title">
      <div className="auth-icon"><Fingerprint size={28} aria-hidden="true" /></div>
      <h1 id="auth-title">{t(title)}</h1>
      <p className="muted">{t(setup ? 'setupText' : recover ? 'recoverText' : link?.purpose === 'invite' ? 'invitationText' : link?.purpose === 'recovery' ? 'recoverWarning' : 'welcomeText')}</p>
      {error && <p role="alert" className="alert error">{t(error)}</p>}
      {notice && <p role="status" className="alert">{t(notice)}</p>}
      {!supported && !recover && <p className="alert" role="alert">{t('unsupported')}</p>}
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          {setup && <label>{t('code')}<input name="token" type="password" autoComplete="one-time-code" required autoFocus /></label>}
          {(setup || link?.purpose === 'invite') && <label>{t('name')}<input name="name" autoComplete="name" maxLength={100} required /></label>}
          {(setup || recover) && <label>{t('email')}<input name="email" type="email" autoComplete="email" required /></label>}
          {setup && <><label>{t('household')}<input name="household" maxLength={100} required /></label><label>{t('timezone')}<input name="timezone" defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone} required /></label></>}
          {recover && !emailAvailable && <p className="alert">{t('noEmail')}</p>}
          <button className="primary wide" disabled={busy || (recover ? !emailAvailable : !supported)} type="submit">{recover ? <Mail size={18} /> : <Fingerprint size={18} />}{t(busy ? 'working' : action)}</button>
        </fieldset>
      </form>
      {!setup && !recover && !link && <><p className="small muted">{t('passkeyText')}</p><button className="text-button" onClick={() => setRecover(true)}>{t('recovery')}</button></>}
      {link?.purpose === 'invite' && <button className="text-button" disabled={busy} onClick={() => void run(async () => { await signIn(); await refresh(); })}>{t('signIn')}</button>}
      {(recover || link) && <button className="text-button" disabled={busy} onClick={() => { setRecover(false); clearLink(); setError(''); }}><ArrowLeft size={16} />{t('back')}</button>}
      {setup && <details className="small muted"><summary>{t('installationOwner')}</summary><code>docker compose exec api node apps/api/dist/accounts/cli.js setup-code</code></details>}
    </section>
    <label className="locale-picker"><span className="sr-only">{t('language')}</span><select value={i18n.language} onChange={(event) => { void i18n.changeLanguage(event.target.value); localStorage.setItem('tendly-language', event.target.value); }}><option value="en">English</option><option value="sv">Svenska</option></select></label>
  </main>;
}
