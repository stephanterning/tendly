import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { parseExpression, type Entity, type FilterExpression, type SavedFilter } from '@tendly/shared';
import { isGeocodedPlace, nearestPlace } from './place-detection.js';

type Fix =
  | { status: 'idle' | 'locating' | 'denied' | 'unavailable' }
  | { status: 'located'; coords: GeolocationCoordinates };
type Status = Fix['status'] | 'unsupported' | 'unconfigured';
type CurrentPlace = { id: string | null | undefined; status: Status; request: () => void };

export const CurrentPlaceContext = createContext<CurrentPlace | null>(null);

export function useCurrentPlace() {
  const place = useContext(CurrentPlaceContext);
  if (!place) throw new Error('Current place requires the workspace');
  return place;
}

export function usesCurrentPlace(expression: SavedFilter['expression']): boolean {
  const matches = (node: FilterExpression): boolean => {
    if (node.type === 'group') return node.children.some(matches);
    const { value } = node;
    return value !== null && typeof value === 'object' && !Array.isArray(value) && value.token === 'CURRENT_PLACE';
  };
  return matches(parseExpression(expression));
}

export function useDetectedPlace(entities: Entity[] | undefined): CurrentPlace {
  const geolocation = window.isSecureContext ? navigator.geolocation : undefined;
  const [fix, setFix] = useState<Fix>({ status: 'idle' });
  const stopWatching = useRef<(() => void) | null>(null);

  const request = useCallback(() => {
    if (!geolocation || stopWatching.current) return;
    let active = true;
    const stop = () => {
      active = false;
      geolocation.clearWatch(watch);
      stopWatching.current = null;
    };
    setFix({ status: 'locating' });
    const watch = geolocation.watchPosition(
      ({ coords }) => { if (active) setFix({ status: 'located', coords }); },
      (error) => {
        if (!active) return;
        stop();
        setFix({ status: error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable' });
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 },
    );
    stopWatching.current = stop;
  }, [geolocation]);
  useEffect(() => () => stopWatching.current?.(), [geolocation]);

  if (!geolocation) return { id: undefined, status: 'unsupported', request };
  if (fix.status !== 'located') return { id: undefined, status: fix.status, request };
  if (!entities) return { id: undefined, status: 'locating', request };
  const places = entities.filter(isGeocodedPlace);
  if (!places.length) return { id: undefined, status: 'unconfigured', request };
  const place = nearestPlace(places, fix.coords);
  return { id: place?.id ?? null, status: 'located', request };
}

const locationMessages: Record<Status, string> = {
  idle: 'locationRequired',
  locating: 'locatingCurrentPlace',
  denied: 'locationPermissionDenied',
  unavailable: 'locationUnavailable',
  unsupported: 'locationUnsupported',
  unconfigured: 'locationUnconfigured',
  located: 'locationNoMatch',
};

export function FilterWarnings({ warnings }: { warnings: string[] | undefined }) {
  const { t } = useTranslation();
  const { status, request } = useCurrentPlace();
  const needsLocation = warnings?.includes('current_place_unavailable');
  useEffect(() => {
    if (!needsLocation || status !== 'idle' || !navigator.permissions) return;
    let active = true;
    // A restored filter can reuse permission without triggering a prompt on navigation.
    void navigator.permissions.query({ name: 'geolocation' }).then((permission) => {
      if (active && permission.state === 'granted') request();
    }).catch(() => {});
    return () => { active = false; };
  }, [needsLocation, request, status]);
  return warnings?.map((warning) => (
    <p role="status" key={warning}>
      {t(warning === 'current_place_unavailable' ? locationMessages[status] : warning)}
      {warning === 'current_place_unavailable' && (status === 'idle' || status === 'denied' || status === 'unavailable') && (
        <> <button type="button" onClick={request}>{t(status === 'idle' ? 'useMyLocation' : 'retry')}</button></>
      )}
    </p>
  ));
}
