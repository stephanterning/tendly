import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Star, Pencil, Copy, Trash2 } from 'lucide-react';
import type { Entity, ViewCatalog, SavedFilter, SavedView } from '@tendly/shared';
import { api, result } from '../accounts/api.js';
import type { Member } from '../tasks/TaskFields.js';
import { EntityIcon, epicStyle } from '../tasks/identity.js';
import { FilterEditor, ViewEditor } from './Editors.js';
import { filterName, viewName } from './api.js';
export function ViewLibrary({
  householdId,
  catalog,
  entities,
  members,
  onOpen,
}: {
  householdId: string;
  catalog: ViewCatalog;
  entities: Entity[];
  members: Member[];
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation(),
    queries = useQueryClient();
  const [tab, setTab] = useState<'views' | 'filters'>('views');
  const [editingFilter, setEditingFilter] = useState<{
    value: SavedFilter | null;
    duplicate?: boolean;
  } | null>(null);
  const [editingView, setEditingView] = useState<{
    value: SavedView | null;
    duplicate?: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [undo, setUndo] = useState<{
    kind: 'filters' | 'views';
    id: string;
    version: number;
  } | null>(null);
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
  const command = (
    kind: 'filters' | 'views',
    id: string,
    baseVersion: number,
    action: 'delete' | 'undelete',
  ) =>
    run(async () => {
      const changed =
        kind === 'filters'
          ? await result(
              api.POST('/api/v1/households/{householdId}/filters/{id}/command', {
                params: { path: { householdId, id } },
                body: { baseVersion, command: action },
              }),
            )
          : await result(
              api.POST('/api/v1/households/{householdId}/views/{id}/command', {
                params: { path: { householdId, id } },
                body: { baseVersion, command: action },
              }),
            );
      setUndo(action === 'delete' ? { kind, id, version: changed.version } : null);
    });
  const common = { householdId, catalog, entities, members };
  return (
    <section className="view-library">
      <header className="page-heading">
        <h1>{t('viewLibrary')}</h1>
      </header>
      <div className="library-tabs" role="group">
        {(['views', 'filters'] as const).map((key) => (
          <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>
            {t(key)}
          </button>
        ))}
      </div>
      <p className="small muted">{t('filterLibraryHelp')}</p>
      {error && (
        <p role="alert" className="alert error">
          {t(error)}
        </p>
      )}
      {undo && (
        <p role="status">
          {t('deletedDefinitions')}{' '}
          <button
            disabled={busy}
            onClick={() => void command(undo.kind, undo.id, undo.version, 'undelete')}
          >
            {t('undo')}
          </button>
        </p>
      )}
      <button
        className="primary"
        onClick={() =>
          tab === 'views' ? setEditingView({ value: null }) : setEditingFilter({ value: null })
        }
      >
        {t(tab === 'views' ? 'createView' : 'createFilter')}
      </button>
      <ul className="definition-list">
        {tab === 'views'
          ? catalog.views
              .filter((v) => !v.deleted)
              .map((v) => (
                <li key={v.id}>
                  <button
                    className="definition-name"
                    style={epicStyle(v)}
                    onClick={() => onOpen(v.id)}
                  >
                    <EntityIcon name={v.icon} />
                    <span>
                      {viewName(v, t)}
                      <small>
                        {t('presentation_' + v.presentation)} · {v.creator}
                      </small>
                    </span>
                  </button>
                  <div className="button-row">
                    <button
                      className="icon-button"
                      aria-label={t('favorite') + ' ' + viewName(v, t)}
                      aria-pressed={catalog.states[v.id]?.favorite ?? false}
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          result(
                            api.PUT('/api/v1/households/{householdId}/views/{id}/state', {
                              params: { path: { householdId, id: v.id } },
                              body: {
                                baseVersion: catalog.states[v.id]?.version ?? 0,
                                favorite: !catalog.states[v.id]?.favorite,
                              },
                            }),
                          ),
                        )
                      }
                    >
                      <Star size={18} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={t('editView') + ' ' + viewName(v, t)}
                      onClick={() => setEditingView({ value: v })}
                    >
                      <Pencil size={18} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={t('duplicate') + ' ' + viewName(v, t)}
                      onClick={() => setEditingView({ value: v, duplicate: true })}
                    >
                      <Copy size={18} />
                    </button>
                    {!v.builtin && (
                      <button
                        className="icon-button"
                        aria-label={t('delete') + ' ' + viewName(v, t)}
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(t('deleteViewConfirm')))
                            void command('views', v.id, v.version, 'delete');
                        }}
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                </li>
              ))
          : catalog.filters
              .filter((f) => !f.deleted)
              .map((f) => (
                <li key={f.id}>
                  <button
                    className="definition-name"
                    style={epicStyle(f)}
                    onClick={() => setEditingFilter({ value: f })}
                  >
                    <EntityIcon name={f.icon} />
                    <span>
                      {filterName(f, t)}
                      <small>
                        {f.creator} · #{f.version}
                      </small>
                    </span>
                  </button>
                  <div className="button-row">
                    <button
                      className="icon-button"
                      aria-label={t('duplicate') + ' ' + filterName(f, t)}
                      onClick={() => setEditingFilter({ value: f, duplicate: true })}
                    >
                      <Copy size={18} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={t('delete') + ' ' + filterName(f, t)}
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm(t('deleteFilterConfirm')))
                          void command('filters', f.id, f.version, 'delete');
                      }}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </li>
              ))}
      </ul>
      <details>
        <summary>{t('deletedDefinitions')}</summary>
        {catalog[tab]
          .filter((v) => v.deleted)
          .map((v) => (
            <div className="button-row" key={v.id}>
              <span>{v.name}</span>
              <button
                disabled={busy}
                onClick={() => void command(tab, v.id, v.version, 'undelete')}
              >
                {t('restoreDefinition')}
              </button>
            </div>
          ))}
      </details>
      {editingFilter && (
        <FilterEditor
          key={editingFilter.value?.id ?? 'new'}
          {...common}
          filter={editingFilter.value}
          duplicate={editingFilter.duplicate ?? false}
          onClose={() => setEditingFilter(null)}
        />
      )}
      {editingView && (
        <ViewEditor
          key={editingView.value?.id ?? 'new'}
          {...common}
          view={editingView.value}
          duplicate={editingView.duplicate ?? false}
          onClose={() => setEditingView(null)}
        />
      )}
    </section>
  );
}
