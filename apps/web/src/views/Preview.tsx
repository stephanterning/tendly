import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { expressionSchema, type FilterExpression } from '@tendly/shared';
import { api, result } from '../accounts/api.js';
import { defined } from '../tasks/api.js';
export function Preview({
  householdId,
  expression,
  filterIds = [],
  viewId,
  replaceFilterId,
}: {
  householdId: string;
  expression: FilterExpression;
  filterIds?: string[];
  viewId?: string | undefined;
  replaceFilterId?: string | undefined;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(expression);
  useEffect(() => {
    const timer = setTimeout(() => setDraft(expression), 250);
    return () => clearTimeout(timer);
  }, [expression]);
  const valid = expressionSchema.safeParse(draft).success;
  const preview = useQuery({
    queryKey: ['planning', householdId, 'preview', draft, filterIds, viewId, replaceFilterId],
    enabled: valid,
    queryFn: () =>
      result(
        api.POST('/api/v1/households/{householdId}/task-query', {
          params: { path: { householdId } },
          body: defined({
            expression: draft,
            filterIds,
            viewId,
            replaceFilterId,
            offset: 0,
            limit: 20,
          }),
        }),
      ),
  });
  return (
    <aside className="filter-preview" aria-label={t('previewResults')}>
      <p className="small muted">{t('previewDraft')}</p>
      {!valid && <p role="alert">{t('invalid_input')}</p>}
      {preview.isFetching && <p role="status">{t('loading')}</p>}
      {preview.isError && (
        <p role="alert">
          {t(preview.error.message)}{' '}
          <button type="button" onClick={() => void preview.refetch()}>
            {t('retry')}
          </button>
        </p>
      )}
      {preview.data && (
        <>
          <h3 aria-live="polite">{t('previewMatches', { count: preview.data.count })}</h3>
          {preview.data.warnings.map((w) => (
            <p role="status" key={w}>
              {t(w)}
            </p>
          ))}
          <ul>
            {preview.data.items.map((task) => (
              <li key={task.id}>
                <strong>{task.title}</strong>
                <small>
                  {t('column_' + task.column)}
                  {task.size ? ' · ' + task.size : ''}
                </small>
              </li>
            ))}
          </ul>
          {!preview.data.count && !preview.data.warnings.length && <p>{t('noFilterMatches')}</p>}
        </>
      )}
    </aside>
  );
}
