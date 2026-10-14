import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowUp, ArrowDown, Plus } from 'lucide-react';
import { entityKinds, palette, type Entity, type EntityKind } from '@tendly/shared';
import { api, result } from '../accounts/api.js';
import { Dialog } from '../components/ui/dialog.js';
import { IconPicker } from './IconPicker.js';
import { PlaceLocation } from './PlaceLocation.js';
import { EntityIcon, epicStyle } from './identity.js';
export function Library({ householdId, entities, admin }: { householdId: string; entities: Entity[]; admin: boolean }) {
  const { t } = useTranslation();
  const queries = useQueryClient();
  const [kind, setKind] = useState<EntityKind>('epic');
  const [editing, setEditing] = useState<Entity | 'new' | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await action(); await queries.invalidateQueries({ queryKey: ['planning', householdId] }); }
    catch (error) { setError(error instanceof Error ? error.message : 'operation_failed'); await queries.invalidateQueries({ queryKey: ['planning', householdId] }); }
    finally { setBusy(false); }
  }
  return <div className="library-page">
    <div className="page-heading"><div><h1>{t('library')}</h1><p className="muted">{t('libraryHelp')}</p></div></div>
    <div className="library-tabs" role="group">{entityKinds.map(k => <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>{t({ epic: 'epics', place: 'places', resource: 'resources', tag: 'tags' }[k])}</button>)}</div>
    {error && <p className="alert error" role="alert">{t(error)}</p>}
    <button className="primary" onClick={() => setEditing('new')}><Plus size={18} />{t('addEntity', { kind: t(kind) })}</button>
    <ul className="entity-list">{entities.filter(e => e.kind === kind).map((entity, index, list) => <li key={entity.id}>
      <button className="entity-main" style={epicStyle(entity)} onClick={() => setEditing(entity)}><span className="entity-symbol"><EntityIcon name={entity.icon} /></span><span>{entity.name}{entity.archived && <small>{t('archived')}</small>}</span></button>
      {kind === 'epic' && <div className="button-row">{(['up', 'down'] as const).map(direction => <button key={direction} className="icon-button quiet" aria-label={t(direction === 'up' ? 'moveUp' : 'moveDown') + ' ' + entity.name} disabled={busy || (direction === 'up' ? index === 0 : index === list.length - 1)} onClick={() => void run(() => result(api.POST('/api/v1/households/{householdId}/entities/{id}/order', { params: { path: { householdId, id: entity.id } }, body: { baseVersion: entity.version, direction } })))}>{direction === 'up' ? <ArrowUp size={17} /> : <ArrowDown size={17} />}</button>)}</div>}
    </li>)}</ul>
    {admin && <SizeSettings householdId={householdId} />}
    {editing && <EntityEditor key={editing === 'new' ? kind : editing.id} entity={editing === 'new' ? null : editing} kind={kind} householdId={householdId} onClose={() => { setEditing(null); void queries.invalidateQueries({ queryKey: ['planning', householdId] }); }} onSaved={() => { setEditing(null); void queries.invalidateQueries({ queryKey: ['planning', householdId] }); }} />}
  </div>;
}
function EntityEditor({ entity, kind, householdId, onClose, onSaved }: { entity: Entity | null; kind: EntityKind; householdId: string; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const queries = useQueryClient();
  const [icon, setIcon] = useState(entity?.icon ?? 'house');
  const [color, setColor] = useState(entity?.color ?? 'blue');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await action(); onSaved(); } catch (error) { setError(error instanceof Error ? error.message : 'operation_failed'); await queries.invalidateQueries({ queryKey: ['planning', householdId] }); } finally { setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const num = (key: string) => data.get(key) ? Number(data.get(key)) : null;
    const changes = { name: String(data.get('name')), description: String(data.get('description')), icon, color, archived: entity?.archived ?? false, latitude: num('latitude'), longitude: num('longitude'), radius: num('radius') };
    void run(() => entity
      ? result(api.PATCH('/api/v1/households/{householdId}/entities/{id}', { params: { path: { householdId, id: entity.id } }, body: { baseVersion: entity.version, changes } }))
      : result(api.POST('/api/v1/households/{householdId}/entities', { params: { path: { householdId } }, body: { ...changes, kind } })));
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }} title={entity?.name ?? t('addEntity', { kind: t(kind) })}>
    {error && <p className="alert error" role="alert">{t(error)}</p>}
    <form onSubmit={submit}><fieldset disabled={busy}>
      <label>{t('entityName')}<input name="name" maxLength={100} defaultValue={entity?.name} required autoFocus /></label>
      <label>{t('description')}<textarea name="description" rows={2} defaultValue={entity?.description ?? ''} /></label>
      {kind === 'place' && <PlaceLocation entity={entity} disabled={busy} />}
      <IconPicker value={icon} onChange={setIcon} />
      <p>{t('color')}</p><div className="color-picker" role="group" aria-label={t('color')}>{palette.map(p => <button type="button" key={p.id} aria-label={t('color_' + p.id)} aria-pressed={color === p.id} style={{ background: 'oklch(70% .14 ' + p.hue + ')' }} onClick={() => setColor(p.id)} />)}</div>
      <div className="epic-previews" style={epicStyle({ color })}><div className="preview-light"><EntityIcon name={icon} /><span>{t('previewLight')}</span></div><div className="preview-dark"><EntityIcon name={icon} /><span>{t('previewDark')}</span></div></div>

      <div className="button-row"><button className="primary" type="submit">{t('save')}</button><button type="button" onClick={onClose}>{t('cancel')}</button></div>
      {entity && <div className="entity-danger button-row">
        {kind === 'epic' && <button type="button" onClick={() => void run(() => result(api.PATCH('/api/v1/households/{householdId}/entities/{id}', { params: { path: { householdId, id: entity.id } }, body: { baseVersion: entity.version, changes: { archived: !entity.archived } } })))}>{t(entity.archived ? 'restoreEntity' : 'archiveEntity')}</button>}
        <button type="button" className="danger" onClick={() => { if (window.confirm(t('deleteEntityConfirm'))) void run(() => result(api.DELETE('/api/v1/households/{householdId}/entities/{id}', { params: { path: { householdId, id: entity.id } }, body: { baseVersion: entity.version } }))); }}>{t('deleteEntity')}</button>
      </div>}
    </fieldset></form>
  </Dialog>;
}
function SizeSettings({ householdId }: { householdId: string }) {
  const { t } = useTranslation();
  const queries = useQueryClient();
  const settings = useQuery({ queryKey: ['planning', householdId, 'settings'], queryFn: () => result(api.GET('/api/v1/households/{householdId}/planning-settings', { params: { path: { householdId } } })) });
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [saved, setSaved] = useState(false);
  return <details className="panel defaults-panel"><summary>{t('householdDefaults')}</summary>
    {settings.data && <form key={settings.data.version} onSubmit={event => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      const thresholds: [number, number, number, number] = [Number(data.get('XS')), Number(data.get('S')), Number(data.get('M')), Number(data.get('L'))];
      setBusy(true); setError(''); setSaved(false);
      void result(api.PUT('/api/v1/households/{householdId}/planning-settings', { params: { path: { householdId } }, body: { baseVersion: settings.data!.version, thresholds } })).then(() => { setSaved(true); return queries.invalidateQueries({ queryKey: ['planning', householdId, 'settings'] }); }).catch((e: Error) => setError(e.message)).finally(() => setBusy(false));
    }}><fieldset disabled={busy}><h3>{t('sizeThresholds')}</h3><p className="small muted">{t('thresholdsHelp')}</p><div className="form-grid">{['XS', 'S', 'M', 'L'].map((size, index) => <label key={size}>{size}<input name={size} type="number" min={1} required defaultValue={settings.data!.thresholds[index]} /></label>)}</div><button type="submit">{t('save')}</button></fieldset></form>}
    {(error || settings.isError) && <p role="alert">{t(error || 'network_error')}</p>}
    {saved && <p role="status">{t('saved')}</p>}
  </details>;
}
