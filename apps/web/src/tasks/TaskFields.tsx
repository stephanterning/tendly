import { columns, sizes, type TaskFields as Fields, type Entity } from '@tendly/shared';
import { useTranslation } from 'react-i18next';
export type Member = { id: string; name: string; email: string; role: 'admin' | 'member' };
export const emptyTask: Fields = { title: '', description: '', column: 'someday', epicId: null, high: false, size: null, estimateMinutes: null, startDate: null, startTime: null, deadlineDate: null, deadlineTime: null, assignees: [], places: [], resources: [], tags: [] };
export function TaskFields({ value, onChange, entities, members, timezone }: {
  value: Fields; onChange: (changes: Partial<Fields>) => void; entities: Entity[]; members: Member[]; timezone: string;
}) {
  const { t } = useTranslation();
  return <>
    <div className="form-grid">
      <label>{t('column')}<select value={value.column} onChange={e => onChange({ column: e.target.value as Fields['column'] })}>{columns.map(c => <option key={c} value={c}>{t('column_' + c)}</option>)}</select></label>
      <label>{t('epic')}<select value={value.epicId ?? ''} onChange={e => onChange({ epicId: e.target.value || null })}><option value="">{t('noEpic')}</option>{entities.filter(e => e.kind === 'epic' && (!e.archived || e.id === value.epicId)).map(e => <option key={e.id} value={e.id}>{e.name}{e.archived ? ' · ' + t('archived') : ''}</option>)}</select></label>
    </div>
    <div className="form-grid">
      <label>{t('size')}<select value={value.size ?? ''} onChange={e => onChange({ size: e.target.value ? e.target.value as Fields['size'] : null })}><option value="">{t('none')}</option>{sizes.map(s => <option key={s}>{s}</option>)}</select></label>
      <label className="check-label"><input type="checkbox" checked={value.high} onChange={e => onChange({ high: e.target.checked })} />{t('high')}</label>
    </div>
    <label>{t('description')}<textarea rows={3} value={value.description} onChange={e => onChange({ description: e.target.value })} /></label>
    <details className="properties" open={value.assignees.length > 0 || undefined}><summary>{t('assignees')}{value.assignees.length ? ' · ' + value.assignees.length : ''}</summary><div className="choice-list">{members.map(member => <label className="check-label" key={member.id}><input type="checkbox" checked={value.assignees.includes(member.id)} onChange={e => onChange({ assignees: e.target.checked ? [...value.assignees, member.id].sort() : value.assignees.filter(id => id !== member.id) })} />{member.name}</label>)}</div></details>
    <details className="properties" open={!!value.startDate || !!value.deadlineDate || undefined}><summary>{t('dates')}</summary><p className="small muted">{t('dateZone', { zone: timezone })}</p>
      <div className="form-grid"><label>{t('startDate')}<input type="date" value={value.startDate ?? ''} onChange={e => onChange({ startDate: e.target.value || null, ...(e.target.value ? {} : { startTime: null }) })} /></label><label>{t('startTime')}<input type="time" disabled={!value.startDate} value={value.startTime ?? ''} onChange={e => onChange({ startTime: e.target.value || null })} /></label></div>
      <div className="form-grid"><label>{t('deadlineDate')}<input type="date" value={value.deadlineDate ?? ''} onChange={e => onChange({ deadlineDate: e.target.value || null, ...(e.target.value ? {} : { deadlineTime: null }) })} /></label><label>{t('deadlineTime')}<input type="time" disabled={!value.deadlineDate} value={value.deadlineTime ?? ''} onChange={e => onChange({ deadlineTime: e.target.value || null })} /></label></div>
    </details>
    <details className="properties"><summary>{t('planningDetails')}</summary>
      <label>{t('estimate')}<input type="number" min={1} max={525600} value={value.estimateMinutes ?? ''} onChange={e => onChange({ estimateMinutes: e.target.value ? Number(e.target.value) : null })} /></label><p className="small muted">{t('estimateHelp')}</p>
      {(['places', 'resources', 'tags'] as const).map((field, index) => <div key={field}><h3>{t(field)}</h3><div className="choice-list">{entities.filter(e => e.kind === ['place', 'resource', 'tag'][index] && (!e.archived || value[field].includes(e.id))).map(entity => <label key={entity.id} className="check-label"><input type="checkbox" checked={value[field].includes(entity.id)} onChange={e => onChange({ [field]: e.target.checked ? [...value[field], entity.id].sort() : value[field].filter(id => id !== entity.id) })} />{entity.name}</label>)}</div></div>)}
    </details>
  </>;
}
