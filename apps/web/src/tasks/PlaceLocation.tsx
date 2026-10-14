import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Entity } from '@tendly/shared';
const PlaceMap = lazy(() => import('./PlaceMap.js'));
export function PlaceLocation({ entity, disabled }: { entity: Entity | null; disabled: boolean }) {
  const { t } = useTranslation();
  const [latitude, setLatitude] = useState(String(entity?.latitude ?? ''));
  const [longitude, setLongitude] = useState(String(entity?.longitude ?? ''));
  const [radius, setRadius] = useState(String(entity?.radius ?? ''));
  const [open, setOpen] = useState(false);
  const point = latitude !== '' && longitude !== '' && Math.abs(Number(latitude)) <= 90 && Math.abs(Number(longitude)) <= 180 ? { lat: Number(latitude), lng: Number(longitude) } : null;
  return <section className="place-location" aria-label={t('coordinates')}>
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>{t(open ? 'hideMap' : 'chooseOnMap')}</button>
    {open && <Suspense fallback={<p role="status">{t('loading')}</p>}><PlaceMap point={point} radius={Math.max(0, Math.min(100000, Number(radius) || 0))} disabled={disabled} onChange={p => {
      setLatitude(p.lat.toFixed(6)); setLongitude(p.lng.toFixed(6));
      if (!radius) setRadius('100');
    }} /></Suspense>}
    <div><p className="small muted">{t('coordinates')}</p>
      <div className="form-grid"><label>{t('latitude')}<input name="latitude" type="number" step="any" min={-90} max={90} value={latitude} required={longitude !== '' || radius !== ''} onChange={e => setLatitude(e.target.value)} /></label>
        <label>{t('longitude')}<input name="longitude" type="number" step="any" min={-180} max={180} value={longitude} required={latitude !== '' || radius !== ''} onChange={e => setLongitude(e.target.value)} /></label></div>
    </div>
    <label>{t('radius')}<input name="radius" type="number" min={1} max={100000} step="any" value={radius} onChange={e => setRadius(e.target.value)} /></label>
    {point && <><label>{t('adjustRadius')}<input type="range" min={10} max={Math.max(2000, Number(radius) || 0)} step={10} value={Number(radius) || 100} onChange={e => setRadius(e.target.value)} /></label>
      <button type="button" onClick={() => { setLatitude(''); setLongitude(''); setRadius(''); }}>{t('clearLocation')}</button></>}
  </section>;
}
