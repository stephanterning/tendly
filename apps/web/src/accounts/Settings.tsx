import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Fingerprint, House, LogOut, Mail, ShieldCheck, UserRound, UsersRound } from 'lucide-react';
import type { Account } from '@tendly/shared';
import { api, result } from './api.js';
import { enroll, errorKey, signIn, type EntryLink } from './Auth.js';

type Run = (action: () => Promise<unknown>, message?: string) => Promise<void>;
export function Settings({ account, refresh, link, clearLink }: { account: Account; refresh: () => Promise<void>; link: EntryLink; clearLink: () => void }) {
  const { t, i18n } = useTranslation();
  const queries = useQueryClient();
  const [page, setPage] = useState('account');
  const [householdId, setHouseholdId] = useState(account.households[0]?.id ?? '');
  const household = account.households.find((item) => item.id === householdId) ?? account.households[0];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const run: Run = async (action, message = 'saved') => {
    setBusy(true); setError(''); setNotice('');
    try { await action(); await queries.invalidateQueries(); await refresh(); setNotice(message); }
    catch (error) { const key = errorKey(error); setError(i18n.exists(key) ? key : 'operation_failed'); if (key === 'sign_in_required') await refresh(); }
    finally { setBusy(false); }
  };
  return <div className="app-shell">
    <header className="topbar"><div className="brand"><House size={22} /> Tendly</div><button className="quiet" onClick={() => void run(async () => { await result(api.POST('/api/v1/auth/logout', { body: {} })); }, '')}><LogOut size={16} />{t('signOut')}</button></header>
    <div className="settings-layout"><aside>
      <h1>{t('settings')}</h1>
      {account.households.length > 1 && <label>{t('household')}<select value={household?.id ?? ''} onChange={(event) => setHouseholdId(event.target.value)}>{account.households.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      {account.households.length === 1 && <p className="muted small">{household?.name}</p>}
      <nav aria-label={t('settings')}>
        <button aria-current={page === 'account' ? 'page' : undefined} onClick={() => { setPage('account'); setError(''); setNotice(''); }}><UserRound size={18} />{t('account')}</button>
        {household && <button aria-current={page === 'members' ? 'page' : undefined} onClick={() => { setPage('members'); setError(''); setNotice(''); }}><UsersRound size={18} />{t('members')}</button>}
        {account.deploymentAdmin && <button aria-current={page === 'smtp' ? 'page' : undefined} onClick={() => { setPage('smtp'); setError(''); setNotice(''); }}><Mail size={18} />{t('smtp')}</button>}
      </nav>
      <p className="stage-note">{t('stage')}</p>
    </aside><main className="settings-main" aria-busy={busy}>
      {error && <div className="alert error" role="alert">{t(error)}{error === 'reauthentication_required' && <><p>{t('reauthText')}</p><button onClick={() => void run(signIn)}>{t('reauth')}</button></>}</div>}
      {notice && <p className="alert" role="status">{t(notice)}</p>}
      {link && <section className="panel"><h2>{t(link.purpose === 'invite' ? 'invitation' : 'verify')}</h2><button className="primary" disabled={busy} onClick={() => void run(async () => {
        if (link.purpose === 'invite') await result(api.POST('/api/v1/auth/invitations/accept', { body: { token: link.token } }));
        else await result(api.POST('/api/v1/auth/verify-email', { body: { token: link.token } }));
        clearLink();
      })}>{t(link.purpose === 'invite' ? 'join' : 'verify')}</button><button className="quiet" onClick={clearLink}>{t('cancel')}</button></section>}
      {page === 'account' && <AccountPanel account={account} run={run} busy={busy} />}
      {page === 'members' && household && <MembersPanel key={household.id} household={household} run={run} busy={busy} />}
      {page === 'smtp' && account.deploymentAdmin && <SmtpPanel run={run} busy={busy} />}
    </main></div>
  </div>;
}
function AccountPanel({ account, run, busy }: { account: Account; run: Run; busy: boolean }) {
  const { t, i18n } = useTranslation();
  const passkeys = useQuery({ queryKey: ['passkeys', account.id], queryFn: () => result(api.GET('/api/v1/account/passkeys')) });
  const sessions = useQuery({ queryKey: ['sessions', account.id], queryFn: () => result(api.GET('/api/v1/account/sessions')) });
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    void run(() => result(api.PATCH('/api/v1/account', { body: { name: String(data.get('name')), language: data.get('language') as 'en' | 'sv', theme: data.get('theme') as 'system' | 'light' | 'dark' } })));
  }
  return <>
    <section className="panel"><h2>{t('profile')}</h2><p className="muted">{account.email}</p>
      <form key={account.id} onSubmit={save}><fieldset disabled={busy}>
        <label>{t('name')}<input name="name" required maxLength={100} defaultValue={account.name} autoComplete="name" /></label>
        <div className="form-grid"><label>{t('language')}<select name="language" defaultValue={account.language}><option value="en">English</option><option value="sv">Svenska</option></select></label>
        <label>{t('theme')}<select name="theme" defaultValue={account.theme}>{['system', 'light', 'dark'].map((theme) => <option key={theme} value={theme}>{t(theme)}</option>)}</select></label></div>
        <button className="primary" type="submit">{t('save')}</button>
      </fieldset></form>
      {!account.emailVerified && <div className="verification"><p>{t('unverified')}</p><button disabled={busy} onClick={() => void run(() => result(api.POST('/api/v1/auth/verify-email/request', { body: {} })), 'emailSent')}>{t('sendVerification')}</button></div>}
    </section>
    <section className="panel"><h2><Fingerprint size={21} />{t('passkeys')}</h2><p className="muted">{t('passkeysText')}</p>
      {passkeys.isError && <p role="alert">{t('network_error')} <button onClick={() => void passkeys.refetch()}>{t('retry')}</button></p>}
      <ul className="item-list">{passkeys.data?.map((key) => <li key={key.id}><div><strong>{key.name}</strong><span className="small muted">{new Date(key.createdAt).toLocaleDateString(i18n.language)}</span></div><button className="quiet" disabled={busy} onClick={() => { if (window.confirm(t('removeConfirm'))) void run(() => result(api.DELETE('/api/v1/account/passkeys/{keyId}', { params: { path: { keyId: key.id } }, body: {} }))); }}>{t('remove')}</button></li>)}</ul>
      <form onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void run(() => enroll({ flow: 'add' }, String(data.get('keyName')))); }}><fieldset disabled={busy}><label>{t('passkeyName')}<input name="keyName" required maxLength={100} placeholder="MacBook, iPhone…" /></label><button type="submit"><Fingerprint size={17} />{t('addPasskey')}</button></fieldset></form>
    </section>
    <section className="panel"><h2><ShieldCheck size={21} />{t('sessions')}</h2>
      {sessions.isError && <p role="alert">{t('network_error')} <button onClick={() => void sessions.refetch()}>{t('retry')}</button></p>}
      <ul className="item-list">{sessions.data?.map((session) => <li key={session.id}><div><strong>{session.current ? t('thisSession') : new Date(session.createdAt).toLocaleString(i18n.language)}</strong><span className="small muted">{new Date(session.createdAt).toLocaleDateString(i18n.language)}</span></div><button className="quiet" disabled={busy} onClick={() => void run(() => result(api.DELETE('/api/v1/account/sessions/{sessionId}', { params: { path: { sessionId: session.id } }, body: {} })))}>{t('endSession')}</button></li>)}</ul>
    </section>
  </>;
}
function MembersPanel({ household, run, busy }: { household: Account['households'][number]; run: Run; busy: boolean }) {
  const { t } = useTranslation();
  const members = useQuery({ queryKey: ['members', household.id], queryFn: () => result(api.GET('/api/v1/households/{id}/members', { params: { path: { id: household.id } } })) });
  return <>
    <section className="panel"><h2>{household.name}</h2><p className="muted small">{household.timezone}</p>
      {members.isError && <p role="alert">{t('network_error')} <button onClick={() => void members.refetch()}>{t('retry')}</button></p>}
      <ul className="item-list members-list">{members.data?.map((member) => <li key={member.id}>
        <div><strong>{member.name}</strong><span className="small muted">{member.email}</span></div>
        {household.role === 'admin' ? <div className="member-actions"><label><span className="sr-only">{t('role')} {member.name}</span><select disabled={busy} value={member.role} onChange={(event) => void run(() => result(api.PATCH('/api/v1/households/{id}/members/{userId}', { params: { path: { id: household.id, userId: member.id } }, body: { role: event.target.value as 'admin' | 'member' } })))}><option value="admin">{t('admin')}</option><option value="member">{t('member')}</option></select></label>
          <details><summary aria-label={member.name}>•••</summary><div className="member-menu"><button disabled={busy} onClick={() => void run(() => result(api.POST('/api/v1/households/{id}/members/{userId}/recovery', { params: { path: { id: household.id, userId: member.id } }, body: {} })), 'emailSent')}>{t('assist')}</button><button disabled={busy} onClick={() => { if (window.confirm(t('memberConfirm'))) void run(() => result(api.DELETE('/api/v1/households/{id}/members/{userId}', { params: { path: { id: household.id, userId: member.id } }, body: {} }))); }}>{t('remove')}</button></div></details>
        </div> : <span className="badge">{t(member.role)}</span>}
      </li>)}</ul>
    </section>
    {household.role === 'admin' && <section className="panel"><h2>{t('invite')}</h2><p className="muted">{t('inviteText')}</p><form onSubmit={(event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      void run(() => result(api.POST('/api/v1/households/{id}/invitations', { params: { path: { id: household.id } }, body: { email: String(data.get('email')), role: data.get('role') as 'admin' | 'member' } })), 'emailSent');
    }}><fieldset disabled={busy}><label>{t('email')}<input name="email" type="email" required /></label><label>{t('role')}<select name="role" defaultValue="member"><option value="member">{t('member')}</option><option value="admin">{t('admin')}</option></select></label><button className="primary" type="submit"><Mail size={17} />{t('sendInvite')}</button></fieldset></form></section>}
  </>;
}
function SmtpPanel({ run, busy }: { run: Run; busy: boolean }) {
  const { t } = useTranslation();
  const smtp = useQuery({ queryKey: ['smtp'], queryFn: () => result(api.GET('/api/v1/settings/smtp')) });
  if (smtp.isPending) return <p role="status">{t('loading')}</p>;
  if (smtp.isError) return <p role="alert">{t(errorKey(smtp.error))}<button onClick={() => { if (errorKey(smtp.error) === 'reauthentication_required') void run(signIn); else void smtp.refetch(); }}>{t(errorKey(smtp.error) === 'reauthentication_required' ? 'reauth' : 'retry')}</button></p>;
  const config = smtp.data;
  return <section className="panel"><h2>{t('smtp')}</h2><p className="muted">{t('smtpText')}</p><form key={JSON.stringify(config)} onSubmit={(event) => {
    event.preventDefault(); const data = new FormData(event.currentTarget); const password = String(data.get('password'));
    void run(() => result(api.PUT('/api/v1/settings/smtp', { body: { host: String(data.get('host')), port: Number(data.get('port')), security: data.get('security') as 'tls' | 'starttls', username: String(data.get('username')), sender: String(data.get('sender')), ...(password ? { password } : {}) } })));
  }}><fieldset disabled={busy}>
    <label>{t('host')}<input name="host" required defaultValue={config?.host} autoComplete="off" /></label>
    <div className="form-grid"><label>{t('port')}<input name="port" type="number" min={1} max={65535} required defaultValue={config?.port ?? 587} /></label><label>{t('security')}<select name="security" defaultValue={config?.security ?? 'starttls'}><option value="starttls">STARTTLS</option><option value="tls">TLS</option></select></label></div>
    <label>{t('username')}<input name="username" defaultValue={config?.username} autoComplete="off" /></label>
    <label>{t('password')}<input name="password" type="password" autoComplete="new-password" placeholder={config?.hasPassword ? t('keepPassword') : ''} /></label>
    <label>{t('sender')}<input name="sender" type="email" required defaultValue={config?.sender} /></label>
    <div className="button-row"><button className="primary" type="submit">{t('save')}</button><button type="button" disabled={!config} onClick={() => void run(() => result(api.POST('/api/v1/settings/smtp/test', { body: {} })), 'emailSent')}>{t('testEmail')}</button></div>
  </fieldset></form></section>;
}
