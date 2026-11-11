import type { Entity } from '@tendly/shared';

type Coordinates = { latitude: number; longitude: number };
type GeocodedPlace = Entity & Coordinates & { radius: number };

export function isGeocodedPlace(place: Entity): place is GeocodedPlace {
  return place.kind === 'place' && !place.archived &&
    place.latitude !== null && place.longitude !== null && place.radius !== null;
}

export function nearestPlace(places: GeocodedPlace[], position: Coordinates) {
  const radians = Math.PI / 180;
  let nearest: GeocodedPlace | null = null;
  let nearestDistance = Infinity;
  for (const place of places) {
    const latitude = (place.latitude - position.latitude) * radians;
    const longitude = (place.longitude - position.longitude) * radians;
    const haversine = Math.sin(latitude / 2) ** 2 +
      Math.cos(position.latitude * radians) * Math.cos(place.latitude * radians) *
      Math.sin(longitude / 2) ** 2;
    const distance = 2 * 6_371_000 * Math.asin(Math.sqrt(Math.min(1, haversine)));
    if (distance <= place.radius && distance < nearestDistance) {
      nearest = place;
      nearestDistance = distance;
    }
  }
  return nearest;
}
