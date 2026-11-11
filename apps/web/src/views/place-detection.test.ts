import { expect, it } from 'vitest';
import type { Entity } from '@tendly/shared';
import { isGeocodedPlace, nearestPlace } from './place-detection.js';

it('chooses the closest configured place inside its radius', () => {
  const position = { latitude: 59.3, longitude: 18.1 };
  const place: Entity = {
    id: 'home', kind: 'place', name: 'Home', description: '', icon: 'house', color: 'blue',
    version: 1, order: 0, archived: false, radius: 100, ...position,
  };
  const places = [
    { ...place, id: 'nearby', latitude: 59.3005 },
    { ...place, id: 'without-radius', radius: null },
    { ...place, id: 'archived', archived: true },
    { ...place, id: 'tag', kind: 'tag' as const },
    place,
  ].filter(isGeocodedPlace);
  expect(places.map((place) => place.id)).toEqual(['nearby', 'home']);
  expect(nearestPlace(places, position)?.id).toBe('home');
  expect(nearestPlace(places, { ...position, latitude: 59.31 })).toBeNull();
});
