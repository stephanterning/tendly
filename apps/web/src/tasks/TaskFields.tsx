import { columns, sizes, type TaskFields as Fields, type Entity, type Task } from '@tendly/shared';
import { useTranslation } from 'react-i18next';
export type Member = { id: string; name: string; email: string; role: 'admin' | 'member' };
export const emptyTask: Fields = { parentId: null, inherit: [], placeExclusions: [], resourceExclusions: [], tagExclusions: [], blockers: [], related: [], title: '', description: '', column: 'someday', epicId: null, high: false, size: null, estimateMinutes: null, startDate: null, startTime: null, deadlineDate: null, deadlineTime: null, assignees: [], places: [], resources: [], tags: [] };
export function TaskFields({ value: local, onChange: update, entities, members, timezone, inheritance }: {
  value: Fields; onChange: (changes: Partial<Fields>) => void; entities: Entity[]; members: Member[]; timezone: string; inheritance?: Task;
}) {
  const { t } = useTranslation();
  const value = { ...local };
  // Display the server-provided parent values; clients do not resolve ancestor chains.
  if (inheritance && local.parentId) for (const key of local.inherit) {
    if (key === 'epicId') value.epicId = inheritance.inheritedValues.epicId;
    if (key === 'high') value.high = inheritance.inheritedValues.high;
    if (key === 'assignees') value.assignees = inheritance.inheritedValues.assignees;
    if (key === 'startDate') { value.startDate = inheritance.inheritedValues.startDate; value.startTime = inheritance.inheritedValues.startTime; }
    if (key === 'deadlineDate') { value.deadlineDate = inheritance.inheritedValues.deadlineDate; value.deadlineTime = inheritance.inheritedValues.deadlineTime; }
  }
  function onChange(changes: Partial<Fields>) {
    const inherit = local.inherit.filter(key => changes[key] === undefined && !(key === 'startDate' && changes.startTime !== undefined) && !(key === 'deadlineDate' && changes.deadlineTime !== undefined));
    // An edit of a displayed inherited field explicitly chooses an override.
    const dates = { ...(local.inherit.includes('startDate') && !inherit.includes('startDate') ? { startDate: value.startDate, startTime: value.startTime } : {}), ...(local.inherit.includes('deadlineDate') && !inherit.includes('deadlineDate') ? { deadlineDate: value.deadlineDate, deadlineTime: value.deadlineTime } : {}) };
    update({ ...dates, ...changes, ...(JSON.stringify(inherit) !== JSON.stringify(local.inherit) ? { inherit } : {}) });
  }
  function mode(key: Fields['inherit'][number]) {
    if (!local.parentId) return null;
    const inherited = local.inherit.includes(key);
    return <button type="button" className="inherit-control quiet" aria-label={t('inheritMode', { field: t(key === 'epicId' ? 'epic' : key) })} onClick={() => update(inherited
      ? { [key]: value[key], ...(key === 'startDate' ? { startTime: value.startTime } : key === 'deadlineDate' ? { deadlineTime: value.deadlineTime } : {}), inherit: local.inherit.filter(k => k !== key) }
      : { inherit: [...local.inherit, key] })}>{t(inherited ? 'inheritedUseOwn' : 'overrideUseInherited')}</button>;
  }
  return <>
    <div className="form-grid">
      <label>{t('column')}<select value={value.column} onChange={e => onChange({ column: e.target.value as Fields['column'] })}>{columns.map(c => <option key={c} value={c}>{t('column_' + c)}</option>)}</select></label>
      <label>{t('epic')}<select value={value.epicId ?? ''} onChange={e => onChange({ epicId: e.target.value || null })}><option value="">{t('noEpic')}</option>{entities.filter(e => e.kind === 'epic' && (!e.archived || e.id === value.epicId)).map(e => <option key={e.id} value={e.id}>{e.name}{e.archived ? ' · ' + t('archived') : ''}</option>)}</select></label>
    </div>
    {mode('epicId')}
    <div className="form-grid">
      <label>{t('size')}<select value={value.size ?? ''} onChange={e => onChange({ size: e.target.value ? e.target.value as Fields['size'] : null })}><option value="">{t('none')}</option>{sizes.map(s => <option key={s}>{s}</option>)}</select></label>
      <label className="check-label"><input type="checkbox" checked={value.high} onChange={e => onChange({ high: e.target.checked })} />{t('high')}</label>
    </div>
    {mode('high')}
    <label>{t('description')}<textarea rows={3} value={value.description} onChange={e => onChange({ description: e.target.value })} /></label>
    <details className="properties" open={value.assignees.length > 0 || undefined}><summary>{t('assignees')}{value.assignees.length ? ' · ' + value.assignees.length : ''}</summary>{mode('assignees')}<div className="choice-list">{members.map(member => <label className="check-label" key={member.id}><input type="checkbox" checked={value.assignees.includes(member.id)} onChange={e => onChange({ assignees: e.target.checked ? [...value.assignees, member.id].sort() : value.assignees.filter(id => id !== member.id) })} />{member.name}</label>)}</div></details>
    <details className="properties" open={!!value.startDate || !!value.deadlineDate || undefined}><summary>{t('dates')}</summary><p className="small muted">{t('dateZone', { zone: timezone })}</p>
      {mode('startDate')}<div className="form-grid"><label>{t('startDate')}<input type="date" value={value.startDate ?? ''} onChange={e => onChange({ startDate: e.target.value || null, ...(e.target.value ? {} : { startTime: null }) })} /></label><label>{t('startTime')}<input type="time" disabled={!value.startDate} value={value.startTime ?? ''} onChange={e => onChange({ startTime: e.target.value || null })} /></label></div>
      {mode('deadlineDate')}<div className="form-grid"><label>{t('deadlineDate')}<input type="date" value={value.deadlineDate ?? ''} onChange={e => onChange({ deadlineDate: e.target.value || null, ...(e.target.value ? {} : { deadlineTime: null }) })} /></label><label>{t('deadlineTime')}<input type="time" disabled={!value.deadlineDate} value={value.deadlineTime ?? ''} onChange={e => onChange({ deadlineTime: e.target.value || null })} /></label></div>
    </details>
    <details className="properties"><summary>{t('planningDetails')}</summary>
      <label>{t('estimate')}<input type="number" min={1} max={525600} value={value.estimateMinutes ?? ''} onChange={e => onChange({ estimateMinutes: e.target.value ? Number(e.target.value) : null })} /></label><p className="small muted">{t('estimateHelp')}</p>
      {(['places', 'resources', 'tags'] as const).map((field, index) => {
        const exclusion = (['placeExclusions', 'resourceExclusions', 'tagExclusions'] as const)[index]!;
        return <div key={field}><h3>{t(field)}</h3>
          {local.parentId && <p className="small muted">{t('itemInheritanceHelp')}</p>}
          <div className="choice-list">{entities.filter(e => e.kind === ['place', 'resource', 'tag'][index] && (!e.archived || value[field].includes(e.id))).map(entity => local.parentId ? <label key={entity.id}>{entity.name}<select aria-label={entity.name + ' · ' + t(field)} value={local[field].includes(entity.id) ? 'add' : local[exclusion].includes(entity.id) ? 'exclude' : 'inherit'} onChange={e => update({
            [field]: [...local[field].filter(id => id !== entity.id), ...(e.target.value === 'add' ? [entity.id] : [])].sort(),
            [exclusion]: [...local[exclusion].filter(id => id !== entity.id), ...(e.target.value === 'exclude' ? [entity.id] : [])].sort(),
          })}><option value="inherit">{t(inheritance?.inheritedValues[field].includes(entity.id) ? 'inherited' : 'followParent')}</option><option value="add">{t('alwaysInclude')}</option><option value="exclude">{t('excludeItem')}</option></select></label> : <label key={entity.id} className="check-label"><input type="checkbox" checked={value[field].includes(entity.id)} onChange={e => onChange({ [field]: e.target.checked ? [...value[field], entity.id].sort() : value[field].filter(id => id !== entity.id) })} />{entity.name}</label>)}</div>
          {inheritance && local.parentId && <p className="small">{t('effectiveNow')}: {inheritance[field].map(id => entities.find(e => e.id === id)?.name).filter(Boolean).join(', ') || t('none')}</p>}
        </div>;
      })}

    </details>
  </>;
}
