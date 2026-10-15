import { type ReactNode, useId } from 'react';
import type { LucideIcon } from 'lucide-react';

/** Visible groups share a heading and landmark instead of hiding fields in disclosures. */
export function Section({ title, icon: Icon, children, className = '' }: { title: string; icon: LucideIcon; children: ReactNode; className?: string }) {
  const id = useId();
  return <section className={'property-section ' + className} aria-labelledby={id}><h3 id={id}><Icon size={18} aria-hidden="true" />{title}</h3>{children}</section>;
}
