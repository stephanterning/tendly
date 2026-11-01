import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus, Settings2 } from 'lucide-react';
import type { ViewCatalog, SavedView, SavedFilter, Entity } from '@tendly/shared';
import type { Member } from '../tasks/TaskFields.js';
import { api, result } from '../accounts/api.js';
import { defined } from '../tasks/api.js';
import { Dialog } from '../components/ui/dialog.js';
import { EntityIcon, epicStyle } from '../tasks/identity.js';
import { FilterEditor, ViewEditor } from './Editors.js';
import { filterName, viewName } from './api.js';
export function QuickBar({
  householdId,
  view,
  catalog,
  entities,
  members,
}: {
  householdId: string;
  view: SavedView;
  catalog: ViewCatalog;
  entities: Entity[];
  members: Member[];
}) {
  const { t } = useTranslation(),
    queries = useQueryClient();
  const state = catalog.states[view.id] ?? { version: 0, activeFilters: [], favorite: false };
  const [createdFilter, setCreatedFilter] = useState<SavedFilter | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [menu, setMenu] = useState<SavedFilter | null>(null),
    [editing, setEditing] = useState<{ filter: SavedFilter | null; duplicate?: boolean } | null>(
      null,
    ),
    [editView, setEditView] = useState(false),
    [choosing, setChoosing] = useState(false);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null),
    held = useRef(false);
  useEffect(() => {
    if (!menu) held.current = false;
  }, [menu]);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'operation_failed');
    } finally {
      await queries.invalidateQueries({ queryKey: ['planning', householdId] });
      setBusy(false);
    }
  };
  const activate = (activeFilters: string[]) =>
    run(() =>
      result(
        api.PUT('/api/v1/households/{householdId}/views/{id}/state', {
          params: { path: { householdId, id: view.id } },
          body: { baseVersion: state.version, activeFilters },
        }),
      ),
    );
  const filters = view.quickFilters.flatMap((id) =>
    catalog.filters.filter((f) => f.id === id && !f.deleted),
  );
  const cancelHold = () => {
    if (hold.current) clearTimeout(hold.current);
    hold.current = null;
  };
  useEffect(
    () => () => {
      if (hold.current) clearTimeout(hold.current);
    },
    [],
  );
  const common = { householdId, catalog, entities, members };
  return (
    <div className="view-controls">
      <div className="quick-filter-bar" role="group" aria-label={t('quickFilters')}>
        {filters.map((filter) => (
          <button
            className="filter-chip"
            style={epicStyle(filter)}
            key={filter.id}
            disabled={busy}
            aria-pressed={state.activeFilters.includes(filter.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu(filter);
            }}
            onPointerDown={(e) => {
              if (e.pointerType === 'touch') {
                held.current = false;
                hold.current = setTimeout(() => {
                  held.current = true;
                  setMenu(filter);
                }, 500);
              }
            }}
            onPointerMove={cancelHold}
            onPointerCancel={cancelHold}
            onPointerUp={cancelHold}
            onKeyDown={(e) => {
              if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
                e.preventDefault();
                setMenu(filter);
              }
            }}
            onClick={() => {
              if (held.current) {
                held.current = false;
                return;
              }
              void activate(
                state.activeFilters.includes(filter.id)
                  ? state.activeFilters.filter((id) => id !== filter.id)
                  : [...state.activeFilters, filter.id],
              );
            }}
          >
            <EntityIcon name={filter.icon} size={16} />
            {filterName(filter, t)}
          </button>
        ))}
        <button
          className="icon-button"
          aria-label={t('manageQuickFilters')}
          onClick={() => setChoosing(true)}
        >
          <Plus size={18} />
        </button>
        {state.activeFilters.some((id) => filters.some((f) => f.id === id)) && (
          <button className="quiet" disabled={busy} onClick={() => void activate([])}>
            {t('clearFilters')}
          </button>
        )}
      </div>
      <details className="view-secondary"><summary>{t('viewOptions')}{catalog.context.currentPlaceId ? ' · ' + (entities.find(e => e.id === catalog.context.currentPlaceId)?.name ?? '') : ''}</summary><div className="view-secondary-controls">
        <label className="current-place">
          <span>{t('currentPlace')}</span>
          <select
            value={catalog.context.currentPlaceId ?? ''}
            disabled={busy}
            onChange={(e) =>
              void run(() =>
                result(
                  api.PUT('/api/v1/households/{householdId}/view-context', {
                    params: { path: { householdId } },
                    body: {
                      baseVersion: catalog.context.version,
                      currentPlaceId: e.target.value || null,
                    },
                  }),
                ),
              )
            }
          >
            <option value="">{t('noCurrentPlace')}</option>
            {entities
              .filter((e) => e.kind === 'place')
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
          </select>
        </label>
        <button className="quiet" aria-label={t('viewOptions')} onClick={() => setEditView(true)}>
          <Settings2 size={18} />
          {t('viewOptions')}
        </button>
      </div></details>
      {error && (
        <p role="alert" className="alert error">
          {t(error)}
        </p>
      )}
      {createdFilter && <Dialog open onReturnFocus={() => requestAnimationFrame(() => {
        const chip = [...document.querySelectorAll<HTMLButtonElement>('.quick-filter-bar button')].find(button => button.textContent === filterName(createdFilter, t));
        (chip ?? document.querySelector<HTMLButtonElement>('.quick-filter-bar .icon-button'))?.focus({ preventScroll: true });
      })} title={t('filterSaved')} onOpenChange={open => { if (!open && !busy) setCreatedFilter(null); }}>
        <p>{t('addFilterToViewHelp', { filter: filterName(createdFilter, t), view: viewName(view, t) })}</p>
        {error && <p role="alert">{t(error)}</p>}
        <div className="button-row">
          <button className="primary" disabled={busy} onClick={() => void run(async () => {
            const latest = catalog.views.find(v => v.id === view.id) ?? view;
            await result(api.PUT('/api/v1/households/{householdId}/views/{id}', {
              params: { path: { householdId, id: view.id } },
              body: { baseVersion: latest.version, changes: defined({ ...latest, quickFilters: [...new Set([...latest.quickFilters, createdFilter.id])] }) },
            }));
            setCreatedFilter(null);
          })}>{t('addToThisView')}</button>
          <button disabled={busy} onClick={() => setCreatedFilter(null)}>{t('notNow')}</button>
        </div>
      </Dialog>}
      {choosing && (
        <Dialog
          open
          title={t('manageQuickFilters')}
          onOpenChange={(open) => {
            if (!open) setChoosing(false);
          }}
        >
          <p>{t('sharedViewWarning')}</p>
          <div className="filter-options">
            {catalog.filters
              .filter((f) => !f.deleted)
              .map((f) => (
                <label className="check-label" key={f.id}>
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={view.quickFilters.includes(f.id)}
                    onChange={(e) => {
                      const quickFilters = e.target.checked
                        ? [...view.quickFilters, f.id]
                        : view.quickFilters.filter((id) => id !== f.id);
                      void run(() =>
                        result(
                          api.PUT('/api/v1/households/{householdId}/views/{id}', {
                            params: { path: { householdId, id: view.id } },
                            body: {
                              baseVersion: view.version,
                              changes: defined({ ...view, quickFilters }),
                            },
                          }),
                        ),
                      );
                    }}
                  />
                  {filterName(f, t)}
                </label>
              ))}
          </div>
          <button
            onClick={() => {
              setChoosing(false);
              setEditing({ filter: null });
            }}
          >
            {t('createFilter')}
          </button>
        </Dialog>
      )}
      {menu && (
        <Dialog
          open
          title={filterName(menu, t)}
          onOpenChange={(open) => {
            if (!open) setMenu(null);
          }}
        >
          <div className="button-row">
            <button
              onClick={() => {
                setEditing({ filter: menu });
                setMenu(null);
              }}
            >
              {t('edit')}
            </button>
            <button
              onClick={() => {
                setEditing({ filter: menu, duplicate: true });
                setMenu(null);
              }}
            >
              {t('duplicate')}
            </button>
            <button
              onClick={() => {
                if (window.confirm(t('deleteFilterConfirm'))) {
                  void run(() =>
                    result(
                      api.POST('/api/v1/households/{householdId}/filters/{id}/command', {
                        params: { path: { householdId, id: menu.id } },
                        body: { baseVersion: menu.version, command: 'delete' },
                      }),
                    ),
                  );
                  setMenu(null);
                }
              }}
            >
              {t('delete')}
            </button>
          </div>
        </Dialog>
      )}
      {editing && (
        <FilterEditor
          {...common}
          filter={editing.filter}
          duplicate={editing.duplicate ?? false}
          viewId={view.id}
          onCreated={filter => { setEditing(null); setCreatedFilter(filter); }}
          onClose={() => setEditing(null)}
        />
      )}
      {editView && <ViewEditor {...common} view={view} onClose={() => setEditView(false)} />}
    </div>
  );
}
