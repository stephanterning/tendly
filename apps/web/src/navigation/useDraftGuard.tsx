import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '../components/ui/dialog.js';
import { useNavigationGuard } from './Navigation.js';
// Explicit-save editors keep their draft mounted until the owner chooses to leave.
export function useDraftGuard(dirty: boolean, busy: boolean) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const action = useRef<() => void>(() => {});
  const request = (next: () => void) => {
    if (busy) return;
    if (!dirty) { next(); return; }
    action.current = next;
    setConfirming(true);
  };
  useNavigationGuard(request);
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, busy]);
  return { request, confirmation: confirming && <Dialog open title={t('unsavedChanges')} onOpenChange={setConfirming}>
    <p>{t('definitionDraftHelp')}</p>
    <div className="button-row">
      <button className="primary" onClick={() => setConfirming(false)}>{t('continueEditing')}</button>
      <button disabled={busy} onClick={() => { setConfirming(false); action.current(); }}>{t('discardDefinitionDraft')}</button>
    </div>
  </Dialog> };
}
