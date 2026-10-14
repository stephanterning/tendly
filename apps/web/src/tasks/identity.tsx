import { lazy, Suspense, type CSSProperties } from 'react';
import { House, Sprout, Car, Wrench, Cat, Box, Fan, Droplets, Heart, ShoppingBag, BookOpen, Briefcase, MapPin, Tag, Hammer, Bike, Coffee, Laptop, Paintbrush, Utensils, Bed, TreePine, Sun, Star } from 'lucide-react';
import { palette, type Entity } from '@tendly/shared';
export const icons = { house: House, sprout: Sprout, car: Car, wrench: Wrench, cat: Cat, box: Box, fan: Fan, droplets: Droplets, heart: Heart, 'shopping-bag': ShoppingBag, 'book-open': BookOpen, briefcase: Briefcase, 'map-pin': MapPin, tag: Tag, hammer: Hammer, bike: Bike, coffee: Coffee, laptop: Laptop, paintbrush: Paintbrush, utensils: Utensils, bed: Bed, 'tree-pine': TreePine, sun: Sun, star: Star };
const CatalogIcon = lazy(() => import('./CatalogIcon.js'));
export function EntityIcon({ name, size = 24 }: { name: string; size?: number }) {
  const Icon = icons[name as keyof typeof icons];
  if (Icon) return <Icon size={size} aria-hidden="true" />;
  if (name === 'trailer' || name === 'trailer-covered') return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 9h15v8h-4m-4 0H2V9m15 7h5v-2" />
    {name === 'trailer-covered' && <path d="M2 9V5h15v4" />}
    <circle cx="11" cy="17" r="2" />
  </svg>;
  return <Suspense fallback={<span style={{ width: size, height: size, display: 'inline-block' }} />}><CatalogIcon key={name} name={name} size={size} /></Suspense>;
}
export function epicStyle(entity?: Pick<Entity, 'color'>): CSSProperties {
  const color = palette.find(p => p.id === entity?.color);
  return color ? { '--epic-hue': color.hue, '--epic-chroma': color.id === 'slate' ? '.009' : color.id === 'brown' ? '.025' : '.038' } as CSSProperties : {};
}
