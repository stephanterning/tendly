import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useRef, type ReactNode } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
// shadcn/ui's Radix composition: focus trapping, Escape and focus restoration live
// in the primitive; Tendly supplies its responsive sheet treatment.
export function Dialog({ open, onOpenChange, title, children, sheet = false, wide = false, className = '', headerContent, mobileBack = false, onReturnFocus, onInitialFocus }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; children: ReactNode; sheet?: boolean; wide?: boolean;
  className?: string; headerContent?: ReactNode; mobileBack?: boolean;
  onReturnFocus?: () => void;
  onInitialFocus?: () => void;
}) {
  const { t } = useTranslation();
  const returnFocus = useRef(document.activeElement);
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="dialog-overlay" />
      <DialogPrimitive.Content className={'dialog-content' + (sheet ? ' task-sheet' : '') + (wide ? ' dialog-wide' : '') + ' ' + className} aria-describedby={undefined} onOpenAutoFocus={event => {
        if (onInitialFocus) { event.preventDefault(); onInitialFocus(); }
      }} onCloseAutoFocus={event => {
        event.preventDefault();
        if (onReturnFocus) { onReturnFocus(); return; }
        const closing = event.currentTarget;
        requestAnimationFrame(() => {
          const nextDialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].filter(el => el !== closing && el.getClientRects().length).at(-1);
          if (nextDialog) {
            if (!nextDialog.contains(document.activeElement)) (nextDialog.querySelector<HTMLElement>('input:not([disabled]), textarea:not([disabled]), button:not([disabled])') ?? nextDialog).focus({ preventScroll: true });
            return;
          }
          const target = returnFocus.current;
          if (target instanceof HTMLElement && target.isConnected) target.focus({ preventScroll: true });
          else document.querySelector<HTMLElement>('.workspace-main')?.focus({ preventScroll: true });
        });
      }}>
        <div className="dialog-heading"><DialogPrimitive.Title>{title}</DialogPrimitive.Title>
          <div className="dialog-heading-actions">{headerContent}
            <DialogPrimitive.Close asChild><button className={'icon-button quiet' + (mobileBack ? ' task-back' : '')} aria-label={t(mobileBack ? 'backToTasks' : 'close')}>
              {mobileBack && <ArrowLeft className="task-back-arrow" size={20} />}<X className="dialog-close-icon" size={20} />
              {mobileBack && <span className="task-back-label">{t('back')}</span>}
            </button></DialogPrimitive.Close>
          </div>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}
