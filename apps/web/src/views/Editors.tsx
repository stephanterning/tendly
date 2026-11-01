import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  allTasks,
  parseExpression,
  expressionSchema,
  filterFieldsSchema,
  viewFieldsSchema,
  palette,
  cardProperties,
  sortKeys,
  type SavedFilter,
  type SavedView,
  type FilterExpression,
  type ViewFields,
  type Entity,
  type ViewCatalog,
} from '@tendly/shared';
import { api, result } from '../accounts/api.js';
import { defined } from '../tasks/api.js';
import { Dialog } from '../components/ui/dialog.js';
import { IconPicker } from '../tasks/IconPicker.js';
import type { Member } from '../tasks/TaskFields.js';
import { ExpressionBuilder } from './ExpressionBuilder.js';
import { Preview } from './Preview.js';
import { filterName, viewName } from './api.js';

type Common = {
  householdId: string;
  entities: Entity[];
  members: Member[];
  catalog: ViewCatalog;
  onClose: () => void;
};
function Identity({
  icon,
  color,
  onIcon,
  onColor,
}: {
  icon: SavedFilter['icon'];
  color: SavedFilter['color'];
  onIcon: (v: SavedFilter['icon']) => void;
  onColor: (v: SavedFilter['color']) => void;
}) {
  const { t } = useTranslation();
  return (
    <details className="filter-identity">
      <summary>
        {t('icon')} · {t('color')}
      </summary>
      <IconPicker value={icon} onChange={onIcon} />
      <div className="color-picker" role="group" aria-label={t('color')}>
        {palette.map((p) => (
          <button
            type="button"
            key={p.id}
            aria-label={t('color_' + p.id)}
            aria-pressed={color === p.id}
            style={{ background: 'oklch(70% .14 ' + p.hue + ')' }}
            onClick={() => onColor(p.id)}
          />
        ))}
      </div>
    </details>
  );
}
export function FilterEditor({
  filter,
  duplicate = false,
  viewId,
  ...props
}: Common & { filter: SavedFilter | null; duplicate?: boolean; viewId?: string | undefined }) {
  const { t } = useTranslation(),
    queries = useQueryClient();
  const [base, setBase] = useState(duplicate ? null : filter);
  const [name, setName] = useState(
    filter ? (duplicate ? t('copyName', { name: filterName(filter, t) }) : filter.name) : '',
  );
  const [icon, setIcon] = useState<SavedFilter['icon']>(filter?.icon ?? 'list-filter');
  const [color, setColor] = useState<SavedFilter['color']>(filter?.color ?? 'blue');
  const [expression, setExpression] = useState<FilterExpression>(
    filter ? parseExpression(filter.expression) : allTasks,
  );
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [showHistory, setShowHistory] = useState(false);
  const [version, setVersion] = useState('');
  const path = { householdId: props.householdId, id: base?.id ?? '' };
  const history = useQuery({
    queryKey: ['planning', props.householdId, 'filter-history', base?.id],
    enabled: !!base && showHistory,
    queryFn: () =>
      result(
        api.GET('/api/v1/households/{householdId}/filters/{id}/versions', { params: { path } }),
      ),
  });
  const refresh = () => queries.invalidateQueries({ queryKey: ['planning', props.householdId] });
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await action();
      await refresh();
      props.onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'operation_failed');
      await refresh();
    } finally {
      setBusy(false);
    }
  };
  const latest = props.catalog.filters.find((f) => f.id === base?.id);
  function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = filterFieldsSchema.safeParse({ name, icon, color, expression });
    if (!parsed.success) {
      setError('invalid_input');
      return;
    }
    const changes = parsed.data;
    void run(() =>
      base
        ? result(
            api.PUT('/api/v1/households/{householdId}/filters/{id}', {
              params: { path },
              body: defined({ baseVersion: base.version, changes }),
            }),
          )
        : result(
            api.POST('/api/v1/households/{householdId}/filters', {
              params: { path: { householdId: props.householdId } },
              body: defined(changes),
            }),
          ),
    );
  }
  const references = props.catalog.views.filter(
    (v) => !v.deleted && v.quickFilters.includes(base?.id ?? ''),
  );
  return (
    <Dialog
      open
      title={t(base ? 'editFilter' : 'createFilter')}
      onOpenChange={(open) => {
        if (!open && !busy) props.onClose();
      }}
      wide
    >
      <form onSubmit={submit}>
        <button
          type="button"
          className="mobile-preview-link"
          onClick={() =>
            document
              .querySelector('.filter-preview')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        >
          {t('previewResults')}
        </button>
        <fieldset disabled={busy}>
          <div className="filter-editor-layout">
            <div>
              <label>
                {t('filterName')}
                <input
                  autoFocus
                  required
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <p className="small muted">
                {t('sharedFilterWarning', { creator: base?.creator ?? t('currentUser') })}
              </p>
              {!!references.length && (
                <p className="small">
                  {t('usedByViews', { views: references.map((v) => viewName(v, t)).join(', ') })}
                </p>
              )}
              <Identity icon={icon} color={color} onIcon={setIcon} onColor={setColor} />
              <ExpressionBuilder
                value={expression}
                onChange={setExpression}
                entities={props.entities}
                members={props.members}
              />
            </div>
            <Preview
              householdId={props.householdId}
              expression={expression}
              viewId={viewId}
              replaceFilterId={base?.id}
            />
          </div>
          {error && (
            <p className="alert error" role="alert">
              {t(error)}
              {error === 'filter_conflict' && latest && (
                <button
                  type="button"
                  onClick={() => {
                    setBase(latest);
                    setName(latest.name);
                    setIcon(latest.icon);
                    setColor(latest.color);
                    setExpression(parseExpression(latest.expression));
                    setError('');
                  }}
                >
                  {t('loadLatest')}
                </button>
              )}
            </p>
          )}
          <div className="button-row editor-actions">
            <button
              type="submit"
              className="primary"
              disabled={!expressionSchema.safeParse(expression).success}
            >
              {t('save')}
            </button>
            <button type="button" onClick={props.onClose}>
              {t('cancel')}
            </button>
          </div>
          {base && (
            <details onToggle={(e) => setShowHistory(e.currentTarget.open)}>
              <summary>{t('versionHistory')}</summary>
              {history.isError && (
                <p role="alert">
                  {t('network_error')}{' '}
                  <button type="button" onClick={() => void history.refetch()}>
                    {t('retry')}
                  </button>
                </p>
              )}
              <label>
                {t('versionHistory')}
                <select value={version} onChange={(e) => setVersion(e.target.value)}>
                  <option value="">—</option>
                  {history.data?.map((v) => (
                    <option key={v.version} value={v.version}>
                      #{v.version} · {v.author} · {new Date(v.createdAt).toLocaleString()}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={!version}
                onClick={() =>
                  void run(() =>
                    result(
                      api.POST('/api/v1/households/{householdId}/filters/{id}/command', {
                        params: { path },
                        body: {
                          baseVersion: base.version,
                          command: 'restore',
                          version: Number(version),
                        },
                      }),
                    ),
                  )
                }
              >
                {t('restoreVersion')}
              </button>
            </details>
          )}
          {base?.builtin && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(t('resetSharedConfirm')))
                  void run(() =>
                    result(
                      api.POST('/api/v1/households/{householdId}/filters/{id}/command', {
                        params: { path },
                        body: { baseVersion: base.version, command: 'reset' },
                      }),
                    ),
                  );
              }}
            >
              {t('restoreDefaults')}
            </button>
          )}
        </fieldset>
      </form>
    </Dialog>
  );
}
export function ViewEditor({
  view,
  duplicate = false,
  ...props
}: Common & { view: SavedView | null; duplicate?: boolean }) {
  const { t } = useTranslation(),
    queries = useQueryClient();
  const [base, setBase] = useState(duplicate ? null : view);
  const [draft, setDraft] = useState<ViewFields>(
    view
      ? {
          ...viewFieldsSchema.parse(view),
          name: duplicate ? t('copyName', { name: viewName(view, t) }) : view.name,
          quickFilters: view.quickFilters.filter((id) =>
            props.catalog.filters.some((f) => f.id === id && !f.deleted),
          ),
        }
      : {
          name: '',
          icon: 'layout-grid',
          color: 'blue',
          presentation: 'board',
          expression: allTasks,
          quickFilters: [],
          sort: 'manual',
          epicLanes: false,
          showEmptyLanes: false,
          cardProperties: ['epic', 'size', 'high', 'deadline', 'assignees'],
        },
  );
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const latest = props.catalog.views.find((v) => v.id === base?.id);
  const path = { householdId: props.householdId, id: base?.id ?? '' };
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await action();
      await queries.invalidateQueries({ queryKey: ['planning', props.householdId] });
      props.onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'operation_failed');
      await queries.invalidateQueries({ queryKey: ['planning', props.householdId, 'views'] });
    } finally {
      setBusy(false);
    }
  };
  function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = viewFieldsSchema.safeParse(draft);
    if (!parsed.success) {
      setError('invalid_input');
      return;
    }
    const changes = parsed.data;
    void run(() =>
      base
        ? result(
            api.PUT('/api/v1/households/{householdId}/views/{id}', {
              params: { path },
              body: defined({ baseVersion: base.version, changes }),
            }),
          )
        : result(
            api.POST('/api/v1/households/{householdId}/views', {
              params: { path: { householdId: props.householdId } },
              body: defined(changes),
            }),
          ),
    );
  }
  return (
    <Dialog
      open
      title={t(base ? 'editView' : 'createView')}
      onOpenChange={(open) => {
        if (!open && !busy) props.onClose();
      }}
      wide
    >
      <form onSubmit={submit}>
        <button
          type="button"
          className="mobile-preview-link"
          onClick={() =>
            document
              .querySelector('.filter-preview')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        >
          {t('previewResults')}
        </button>
        <fieldset disabled={busy}>
          <p className="small muted">{t('sharedViewWarning')}</p>
          <div className="form-grid">
            <label>
              {t('viewName')}
              <input
                required
                maxLength={100}
                autoFocus
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label>
              {t('presentation')}
              <select
                value={draft.presentation}
                onChange={(e) =>
                  setDraft({ ...draft, presentation: e.target.value as 'list' | 'board' })
                }
              >
                <option value="list">{t('presentation_list')}</option>
                <option value="board">{t('presentation_board')}</option>
              </select>
            </label>
          </div>
          <Identity
            icon={draft.icon}
            color={draft.color}
            onIcon={(icon) => setDraft({ ...draft, icon })}
            onColor={(color) => setDraft({ ...draft, color })}
          />
          <div className="filter-editor-layout">
            <div>
              <h3>{t('baseFilter')}</h3>
              <ExpressionBuilder
                value={draft.expression as FilterExpression}
                onChange={(expression) => setDraft({ ...draft, expression })}
                entities={props.entities}
                members={props.members}
              />
            </div>
            <Preview
              householdId={props.householdId}
              expression={draft.expression as FilterExpression}
              filterIds={(props.catalog.states[base?.id ?? '']?.activeFilters ?? []).filter((id) =>
                draft.quickFilters.includes(id),
              )}
            />
          </div>
          <label>
            {t('sorting')}
            <select
              value={draft.sort}
              onChange={(e) => setDraft({ ...draft, sort: e.target.value as ViewFields['sort'] })}
            >
              {sortKeys.map((sort) => (
                <option key={sort} value={sort}>
                  {t('sort_' + sort)}
                </option>
              ))}
            </select>
          </label>
          <div className="button-row">
            <label className="check-label">
              <input
                type="checkbox"
                checked={draft.epicLanes}
                onChange={(e) => setDraft({ ...draft, epicLanes: e.target.checked })}
              />
              {t('epicLanes')}
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={draft.showEmptyLanes}
                onChange={(e) => setDraft({ ...draft, showEmptyLanes: e.target.checked })}
              />
              {t('showEmptyLanes')}
            </label>
          </div>
          <details open>
            <summary>{t('quickFilters')}</summary>
            <p className="small muted">{t('filterLibraryHelp')}</p>
            <div className="filter-options">
              {props.catalog.filters
                .filter((f) => !f.deleted)
                .map((f) => (
                  <label className="check-label" key={f.id}>
                    <input
                      type="checkbox"
                      checked={draft.quickFilters.includes(f.id)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          quickFilters: e.target.checked
                            ? [...draft.quickFilters, f.id]
                            : draft.quickFilters.filter((id) => id !== f.id),
                        })
                      }
                    />
                    {filterName(f, t)}
                  </label>
                ))}
            </div>
            <ol className="quick-order">
              {draft.quickFilters.map((id, index) => (
                <li key={id}>
                  <span>
                    {filterName(
                      props.catalog.filters.find((f) => f.id === id)!,
                      t,
                    )}
                  </span>
                  {(['up', 'down'] as const).map((direction) => (
                    <button
                      type="button"
                      key={direction}
                      disabled={
                        direction === 'up' ? index === 0 : index === draft.quickFilters.length - 1
                      }
                      aria-label={
                        t(direction === 'up' ? 'moveUp' : 'moveDown') +
                        ' ' +
                        filterName(
                          props.catalog.filters.find((f) => f.id === id)!,
                          t,
                        )
                      }
                      onClick={() => {
                        const ids = [...draft.quickFilters],
                          at = index + (direction === 'up' ? -1 : 1);
                        [ids[index], ids[at]] = [ids[at]!, ids[index]!];
                        setDraft({ ...draft, quickFilters: ids });
                      }}
                    >
                      {direction === 'up' ? '↑' : '↓'}
                    </button>
                  ))}
                </li>
              ))}
            </ol>
          </details>
          <details>
            <summary>{t('cardMetadata')}</summary>
            <div className="filter-options">
              {cardProperties.map((key) => (
                <label className="check-label" key={key}>
                  <input
                    type="checkbox"
                    checked={draft.cardProperties.includes(key)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        cardProperties: e.target.checked
                          ? [...draft.cardProperties, key]
                          : draft.cardProperties.filter((p) => p !== key),
                      })
                    }
                  />
                  {t('card_' + key)}
                </label>
              ))}
            </div>
          </details>
          {error && (
            <p className="alert error" role="alert">
              {t(error)}
              {error === 'view_conflict' && latest && (
                <button
                  type="button"
                  onClick={() => {
                    setBase(latest);
                    setDraft(viewFieldsSchema.parse(latest));
                    setError('');
                  }}
                >
                  {t('loadLatest')}
                </button>
              )}
            </p>
          )}
          <div className="button-row editor-actions">
            <button
              type="submit"
              className="primary"
              disabled={!expressionSchema.safeParse(draft.expression).success}
            >
              {t('save')}
            </button>
            <button type="button" onClick={props.onClose}>
              {t('cancel')}
            </button>
            {base?.builtin && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(t('resetSharedConfirm')))
                    void run(() =>
                      result(
                        api.POST('/api/v1/households/{householdId}/views/{id}/command', {
                          params: { path },
                          body: { baseVersion: base.version, command: 'reset' },
                        }),
                      ),
                    );
                }}
              >
                {t('restoreDefaults')}
              </button>
            )}
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
