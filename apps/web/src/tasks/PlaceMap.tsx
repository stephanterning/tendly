import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
type Point = { lat: number; lng: number };
type Props = { point: Point | null; radius: number; disabled: boolean; onChange: (point: Point) => void };
export default function PlaceMap({ point, radius, disabled, onChange }: Props) {
  const { t } = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const circle = useRef<L.Circle | null>(null);
  const current = useRef({ point, radius, disabled, onChange });
  const [error, setError] = useState(false);
  useEffect(() => { current.current = { point, radius, disabled, onChange }; }, [point, radius, disabled, onChange]);
  useEffect(() => {
    if (!container.current) return;
    const initial = current.current;
    const instance = L.map(container.current, { scrollWheelZoom: false, worldCopyJump: true, minZoom: 2, maxZoom: 19, zoomControl: false }).setView(initial.point ?? [20, 0], initial.point ? 15 : 2);
    map.current = instance;
    L.control.zoom({ zoomInTitle: t('zoomIn'), zoomOutTitle: t('zoomOut') }).addTo(instance);
    L.control.scale({ imperial: false }).addTo(instance);
    function choose(p: L.LatLng) {
      if (!current.current.disabled) current.current.onChange({ lat: Math.max(-90, Math.min(90, p.lat)), lng: p.wrap().lng });
    }
    instance.on('click', (event: L.LeafletMouseEvent) => choose(event.latlng));
    const abort = new AbortController();
    // Only an explicitly opened map contacts a tile provider. No account or place names are sent.
    void fetch('/map-config.json', { signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error('map_config');
      const config: unknown = await response.json();
      if (!config || typeof config !== 'object' || !('tileUrl' in config) || typeof config.tileUrl !== 'string' || !('attribution' in config) || typeof config.attribution !== 'string') throw new Error('map_config');
      const url = new URL(config.tileUrl, location.origin);
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error('map_config');
      const credit = document.createElement('span'); credit.textContent = config.attribution;
      if ('attributionUrl' in config && typeof config.attributionUrl === 'string' && /^https?:\/\//.test(config.attributionUrl)) {
        const link = document.createElement('a'); link.href = config.attributionUrl; link.textContent = config.attribution; link.target = '_blank'; link.rel = 'noopener noreferrer'; credit.replaceChildren(link);
      }
      const maxZoom = 'maxZoom' in config && typeof config.maxZoom === 'number' ? Math.max(2, Math.min(22, config.maxZoom)) : 19;
      if (abort.signal.aborted) return;
      instance.setMaxZoom(maxZoom);
      L.tileLayer(config.tileUrl, { attribution: credit.innerHTML, maxZoom, referrerPolicy: 'strict-origin', keepBuffer: 1 }).on('tileerror', () => setError(true)).addTo(instance);
    }).catch(() => { if (!abort.signal.aborted) setError(true); });
    const observer = new ResizeObserver(() => instance.invalidateSize()); observer.observe(container.current);
    return () => { abort.abort(); observer.disconnect(); instance.remove(); map.current = null; marker.current = null; circle.current = null; };
  }, [t]);
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    if (!point) { marker.current?.remove(); circle.current?.remove(); marker.current = null; circle.current = null; return; }
    if (!marker.current) {
      marker.current = L.marker(point, { draggable: !disabled, title: t('movePin'), keyboard: false, icon: L.divIcon({ className: 'place-pin', html: '<span></span>', iconSize: [28, 36], iconAnchor: [14, 36] }) }).addTo(instance);
      marker.current.on('dragend', () => {
        const p = marker.current!.getLatLng().wrap();
        if (!current.current.disabled) current.current.onChange({ lat: Math.max(-90, Math.min(90, p.lat)), lng: p.lng });
      });
    }
    marker.current.setLatLng(point);
    if (disabled) marker.current.dragging?.disable(); else marker.current.dragging?.enable();
    if (!circle.current) circle.current = L.circle(point, { radius, color: '#087fff', fillOpacity: 0.15, weight: 2, interactive: false }).addTo(instance);
    circle.current.setLatLng(point).setRadius(radius);
  }, [point, radius, disabled, t]);
  return <div className="place-map-block">
    <p className="small muted">{t('mapHelp')}</p>
    <div className="place-map" ref={container} role="region" aria-label={t('locationMap')} />
    {error && <p role="status" className="small">{t('mapUnavailable')}</p>}
    <div className="button-row"><button type="button" disabled={disabled} onClick={() => { const p = map.current?.getCenter().wrap(); if (p) onChange({ lat: p.lat, lng: p.lng }); }}>{t('pinAtCenter')}</button>
      {point && <button type="button" onClick={() => { if (circle.current && radius > 0) map.current?.fitBounds(circle.current.getBounds(), { padding: [40, 40], maxZoom: 18 }); else map.current?.setView(point, 16); }}>{t('showArea')}</button>}</div>
  </div>;
}
