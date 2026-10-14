import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
export default function CatalogIcon({ name, size }: { name: string; size: number }) {
  return <DynamicIcon name={name as IconName} size={size} aria-hidden="true" />;
}
