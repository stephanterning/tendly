import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, result } from './api.js';
import { Auth, type EntryLink } from './Auth.js';
import { Settings } from './Settings.js';
function readLink(): EntryLink {
  const params = new URLSearchParams(window.location.hash.slice(1));
  for (const purpose of ['invite', 'recovery', 'verify_email']) {
    const token = params.get(purpose);
    if (token) return { purpose, token };
  }
  return null;
}
// Read once before React's strict-mode render replay, then remove sensitive fragments.
const initialLink = readLink();
if (initialLink) history.replaceState(null, '', location.pathname + location.search);
export function App() {
  const { t, i18n } = useTranslation();
  const queries = useQueryClient();
  const [link, setLink] = useState<EntryLink>(initialLink);
  useEffect(() => {
    function captureLink() {
      const next = readLink();
      if (next) {
        history.replaceState(null, '', location.pathname + location.search);
        setLink(next);
      }
    }
    window.addEventListener('hashchange', captureLink);
    return () => window.removeEventListener('hashchange', captureLink);
  }, []);
  const status = useQuery({ queryKey: ['status'], queryFn: () => result(api.GET('/api/v1/auth/status')) });
  const session = useQuery({ queryKey: ['session'], queryFn: () => result(api.GET('/api/v1/auth/session')), refetchOnWindowFocus: true });
  const account = session.data?.account;
  useEffect(() => {
    if (account) {
      void i18n.changeLanguage(account.language);
      localStorage.setItem('tendly-language', account.language);
      document.documentElement.dataset.theme = account.theme;
    }
  }, [account, i18n]);
  useEffect(() => { document.documentElement.lang = i18n.language; }, [i18n.language]);
  async function refresh() { await queries.invalidateQueries({ queryKey: ['session'] }); await queries.invalidateQueries({ queryKey: ['status'] }); }
  if (status.isError || session.isError) return <main className="auth-layout"><section className="auth-card"><h1>Tendly</h1><p role="alert">{t('network_error')}</p><button onClick={() => { void status.refetch(); void session.refetch(); }}>{t('retry')}</button></section></main>;
  if (status.isPending || session.isPending) return <main className="auth-layout"><p role="status">{t('loading')}</p></main>;
  if (account && link?.purpose !== 'recovery') return <Settings account={account} refresh={refresh} link={link} useInvitation={(token) => setLink({ purpose: 'invite', token })} clearLink={() => setLink(null)} />;
  return <Auth key={link?.token ?? 'login'} initialized={status.data.initialized} emailAvailable={status.data.emailAvailable} link={link} refresh={refresh} useInvitation={(token) => setLink({ purpose: 'invite', token })} clearLink={() => setLink(null)} />;
}
