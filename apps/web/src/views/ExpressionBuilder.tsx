import { useTranslation } from 'react-i18next';
import {
  filterFields,
  operatorsFor,
  columns,
  sizes,
  type FilterExpression,
  type FilterField,
  type FilterOperator,
  type FilterValue,
  type Entity,
} from '@tendly/shared';
import type { Member } from '../tasks/TaskFields.js';
export const newRule = (): FilterExpression => ({
  type: 'predicate',
  field: 'column',
  operator: 'IN',
  value: ['todo'],
});
function initialValue(field: FilterField, operator: FilterOperator): FilterValue {
  if (operator === 'EMPTY' || operator === 'NOT_EMPTY') return null;
  if (['available', 'overdue', 'high'].includes(field)) return true;
  if (['title', 'description'].includes(field)) return '';
  if (['startDate', 'deadlineDate', 'createdAt', 'completedAt'].includes(field))
    return { token: 'TODAY' };
  if (field === 'estimateMinutes') return 60;
  return [];
}
export function ExpressionBuilder({
  value,
  onChange,
  entities,
  members,
  depth = 0,
  onRemove,
}: {
  value: FilterExpression;
  onChange: (v: FilterExpression) => void;
  entities: Entity[];
  members: Member[];
  depth?: number;
  onRemove?: () => void;
}) {
  const { t } = useTranslation();
  if (value.type === 'group')
    return (
      <fieldset className="filter-group">
        <legend>{t('filterGroup')}</legend>
        <div className="button-row">
          <select
            aria-label={t('filterGroup')}
            value={value.operator}
            onChange={(e) => {
              const operator = e.target.value as 'AND' | 'OR' | 'NOT';
              onChange({
                type: 'group',
                operator,
                children:
                  operator === 'NOT'
                    ? [value.children.length === 1 ? value.children[0]! : value]
                    : value.children,
              });
            }}
          >
            {(['AND', 'OR', 'NOT'] as const).map((op) => (
              <option key={op} value={op}>
                {t('filter' + op)}
              </option>
            ))}
          </select>
          {onRemove && (
            <button type="button" onClick={onRemove}>
              {t('removeRule')}
            </button>
          )}
        </div>
        {value.children.map((child, index) => (
          <ExpressionBuilder
            key={index}
            value={child}
            entities={entities}
            members={members}
            depth={depth + 1}
            onChange={(next) =>
              onChange({
                ...value,
                children: value.children.map((n, i) => (i === index ? next : n)),
              })
            }
            {...(value.operator === 'NOT'
              ? {}
              : {
                  onRemove: () =>
                    onChange({ ...value, children: value.children.filter((_, i) => i !== index) }),
                })}
          />
        ))}
        {value.operator !== 'NOT' && (
          <div className="button-row">
            <button
              type="button"
              disabled={depth >= 9 || value.children.length >= 50}
              onClick={() => onChange({ ...value, children: [...value.children, newRule()] })}
            >
              {t('addRule')}
            </button>
            <button
              type="button"
              disabled={depth >= 8 || value.children.length >= 50}
              onClick={() =>
                onChange({
                  ...value,
                  children: [
                    ...value.children,
                    { type: 'group', operator: 'OR', children: [newRule()] },
                  ],
                })
              }
            >
              {t('addGroup')}
            </button>
          </div>
        )}
      </fieldset>
    );
  const options =
    value.field === 'column'
      ? columns.map((id) => ({ id, label: t('column_' + id) }))
      : value.field === 'size'
        ? sizes.map((id) => ({ id, label: id }))
        : value.field === 'assignees'
          ? members.map((m) => ({ id: m.id, label: m.name }))
          : entities
              .filter(
                (e) =>
                  e.kind ===
                  (
                    {
                      epicId: 'epic',
                      places: 'place',
                      resources: 'resource',
                      tags: 'tag',
                    } as Record<string, string>
                  )[value.field],
              )
              .map((e) => ({ id: e.id, label: e.name }));
  const dynamic =
    value.value && typeof value.value === 'object' && !Array.isArray(value.value)
      ? value.value
      : null;
  const isDate = ['startDate', 'deadlineDate', 'createdAt', 'completedAt'].includes(value.field);
  const isSet = ['column', 'size', 'epicId', 'assignees', 'places', 'resources', 'tags'].includes(
    value.field,
  );
  const changeValue = (next: FilterValue) => onChange({ ...value, value: next });
  return (
    <div className="filter-rule">
      <label>
        {t('filterField')}
        <select
          aria-label={t('filterField')}
          value={value.field}
          onChange={(e) => {
            const field = e.target.value as FilterField,
              operator = operatorsFor(field)[0]!;
            onChange({ type: 'predicate', field, operator, value: initialValue(field, operator) });
          }}
        >
          {filterFields.map((field) => (
            <option key={field} value={field}>
              {t('field_' + field)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('filterOperator')}
        <select
          aria-label={t('filterOperator')}
          value={value.operator}
          onChange={(e) => {
            const operator = e.target.value as FilterOperator;
            onChange({
              ...value,
              operator,
              value:
                ['EMPTY', 'NOT_EMPTY'].includes(operator) || value.value === null
                  ? initialValue(value.field, operator)
                  : value.value,
            });
          }}
        >
          {operatorsFor(value.field).map((op) => (
            <option key={op} value={op}>
              {t('op_' + op)}
            </option>
          ))}
        </select>
      </label>
      {!['EMPTY', 'NOT_EMPTY'].includes(value.operator) && (
        <>
          {(isDate || ['assignees', 'places'].includes(value.field)) && (
            <label>
              {t('operandMode')}
              <select
                aria-label={t('operandMode')}
                value={dynamic?.token ?? 'literal'}
                onChange={(e) =>
                  changeValue(
                    e.target.value === 'literal'
                      ? isDate
                        ? ''
                        : []
                      : { token: e.target.value as 'CURRENT_USER' | 'CURRENT_PLACE' | 'TODAY' },
                  )
                }
              >
                <option value="literal">{t(isDate ? 'specificDate' : 'specificValues')}</option>
                <option
                  value={
                    isDate ? 'TODAY' : value.field === 'places' ? 'CURRENT_PLACE' : 'CURRENT_USER'
                  }
                >
                  {t(isDate ? 'today' : value.field === 'places' ? 'currentPlace' : 'currentUser')}
                </option>
              </select>
            </label>
          )}
          {dynamic?.token === 'TODAY' && (
            <label>
              {t('daysFromToday')}
              <input
                type="number"
                min={-36500}
                max={36500}
                value={dynamic.offsetDays ?? 0}
                onChange={(e) =>
                  changeValue({ token: 'TODAY', offsetDays: Number(e.target.value) })
                }
              />
            </label>
          )}
          {!dynamic &&
            (isSet ? (
              <label className="filter-values">
                {t('filterValue')}
                <select
                  aria-label={t('filterValue')}
                  multiple
                  value={Array.isArray(value.value) ? value.value : []}
                  onChange={(e) =>
                    changeValue(Array.from(e.target.selectedOptions, (o) => o.value))
                  }
                >
                  {options.map((o) => (
                    <option value={o.id} key={o.id}>
                      {o.label}
                    </option>
                  ))}
                  {Array.isArray(value.value) &&
                    value.value
                      .filter((id) => !options.some((o) => o.id === id))
                      .map((id) => (
                        <option value={id} key={id}>
                          {t('missingChoice')}
                        </option>
                      ))}
                </select>
              </label>
            ) : typeof value.value === 'boolean' ? (
              <label>
                {t('filterValue')}
                <select
                  aria-label={t('filterValue')}
                  value={String(value.value)}
                  onChange={(e) => changeValue(e.target.value === 'true')}
                >
                  <option value="true">{t('yes')}</option>
                  <option value="false">{t('no')}</option>
                </select>
              </label>
            ) : (
              <label>
                {t('filterValue')}
                <input
                  aria-label={t('filterValue')}
                  type={isDate ? 'date' : value.field === 'estimateMinutes' ? 'number' : 'text'}
                  value={
                    typeof value.value === 'string' || typeof value.value === 'number'
                      ? value.value
                      : ''
                  }
                  onChange={(e) =>
                    changeValue(
                      value.field === 'estimateMinutes' ? Number(e.target.value) : e.target.value,
                    )
                  }
                />
              </label>
            ))}
        </>
      )}
      {depth === 0 && (
        <button
          type="button"
          onClick={() => onChange({ type: 'group', operator: 'AND', children: [value] })}
        >
          {t('addGroup')}
        </button>
      )}
      {onRemove && (
        <button type="button" className="quiet" onClick={onRemove}>
          {t('removeRule')}
        </button>
      )}
    </div>
  );
}
