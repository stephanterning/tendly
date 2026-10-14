import type { CSSProperties } from 'react';
import { House, Sprout, Car, Wrench, Cat, Box, Fan, Droplets, Heart, ShoppingBag, BookOpen, Briefcase, MapPin, Tag, Hammer, Bike, Coffee, Laptop, Paintbrush, Utensils, Bed, TreePine, Sun, Star } from 'lucide-react';
import { palette, type Entity } from '@tendly/shared';
export const icons = { house: House, sprout: Sprout, car: Car, wrench: Wrench, cat: Cat, box: Box, fan: Fan, droplets: Droplets, heart: Heart, 'shopping-bag': ShoppingBag, 'book-open': BookOpen, briefcase: Briefcase, 'map-pin': MapPin, tag: Tag, hammer: Hammer, bike: Bike, coffee: Coffee, laptop: Laptop, paintbrush: Paintbrush, utensils: Utensils, bed: Bed, 'tree-pine': TreePine, sun: Sun, star: Star };
export function EntityIcon({ name, size = 24 }: { name: string; size?: number }) {
  const Icon = icons[name as keyof typeof icons] ?? House;
  return <Icon size={size} aria-hidden="true" />;
}
export function epicStyle(entity?: Pick<Entity, 'color'>): CSSProperties {
  const color = palette.find(p => p.id === entity?.color);
  return color ? { '--epic-hue': color.hue, '--epic-chroma': color.id === 'slate' ? '.009' : color.id === 'brown' ? '.025' : '.038' } as CSSProperties : {};
}
