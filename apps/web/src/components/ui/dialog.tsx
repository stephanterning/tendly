import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
// shadcn/ui's Radix composition: focus trapping, Escape and focus restoration live
// in the primitive; Tendly supplies its responsive sheet treatment.
export function Dialog({ open, onOpenChange, title, children, sheet = false, className = '' }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; children: ReactNode; sheet?: boolean; className?: string;
}) {
  const { t } = useTranslation();
  const returnFocus = useRef(document.activeElement);
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="dialog-overlay" />
      <DialogPrimitive.Content className={(sheet ? 'dialog-content task-sheet' : 'dialog-content') + ' ' + className} aria-describedby={undefined} onCloseAutoFocus={event => {
        event.preventDefault();
        const target = returnFocus.current;
        if (target instanceof HTMLElement && target.isConnected) target.focus();
        else document.querySelector<HTMLElement>('.workspace-main')?.focus();
      }}>
        <div className="dialog-heading"><DialogPrimitive.Title>{title}</DialogPrimitive.Title>
          <DialogPrimitive.Close asChild><button className="icon-button quiet" aria-label={t('close')}><X size={20} /></button></DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}
