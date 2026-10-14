import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { SavedFilter, Entity } from '@tendly/shared';
import { Dialog } from '../components/ui/dialog.js';
import { EntityIcon, epicStyle } from '../tasks/identity.js';
import type { Member } from '../tasks/TaskFields.js';
import { DocumentEditor } from './PlanningLibrary.js';
import { api, result } from '../accounts/api.js';
export function QuickFilterBar({ householdId, filters, active, onChange, entities, members, onManage }: { onManage: () => void; householdId: string; filters: SavedFilter[]; active: string[]; onChange: (ids: string[]) => void; entities: Entity[]; members: Member[] }) {
  const { t } = useTranslation(), queries = useQueryClient(), [menu, setMenu] = useState<SavedFilter | null>(null), [editing, setEditing] = useState<SavedFilter | null>(null), [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), held = useRef(false);
  const refresh = () => queries.invalidateQueries({ queryKey: ['planning', householdId] });
  return <><div className="quick-filter-bar" aria-label={t('quickFilters')}>{filters.map(filter => <button key={filter.id} style={epicStyle(filter)} aria-pressed={active.includes(filter.id)} onContextMenu={e => { e.preventDefault(); setMenu(filter); }} onPointerDown={e => { held.current = false; if (e.pointerType === 'touch') timer.current = setTimeout(() => { held.current = true; setMenu(filter); }, 550); }} onPointerUp={() => clearTimeout(timer.current)} onPointerCancel={() => clearTimeout(timer.current)} onClick={() => { if (!held.current) onChange(active.includes(filter.id) ? active.filter(id => id !== filter.id) : [...active, filter.id]); }}><EntityIcon name={filter.icon} size={16} />{filter.name}</button>)}<button onClick={onManage} aria-label={t('viewsAndFilters')}>+</button>{!!active.length && <button className="quiet" onClick={() => onChange([])}>{t('resetFilters')}</button>}</div>
    {menu && <Dialog open title={menu.name} onOpenChange={open => { if (!open) setMenu(null); }}><div className="button-row"><button onClick={() => { setEditing(menu); setMenu(null); }}>{t('edit')}</button><button onClick={() => { setEditing({ ...menu, id: '', version: 0, name: menu.name + ' · ' + t('copy') }); setMenu(null); }}>{t('duplicate')}</button><button onClick={() => { if (window.confirm(t('deleteSharedConfirm'))) void result(api.DELETE('/api/v1/households/{householdId}/filters/{id}', { params: { path: { householdId, id: menu.id } }, body: { baseVersion: menu.version } })).then(async () => { await refresh(); setMenu(null); }).catch(e => setError((e as Error).message)); }}>{t('delete')}</button></div>{error && <p role="alert">{t(error)}</p>}</Dialog>}
    {editing && <DocumentEditor kind="filter" document={editing} householdId={householdId} entities={entities} members={members} filters={filters} onClose={() => setEditing(null)} onSaved={async () => { await refresh(); setEditing(null); }} />}
  </>;
}
