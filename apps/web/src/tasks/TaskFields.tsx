import { AlignLeft, CalendarDays, CircleAlert, Clock3, MapPin, Ruler, SlidersHorizontal, Tags, UsersRound, Wrench } from 'lucide-react';
import { Section } from '../components/Section.js';
import { lazy, Suspense } from 'react';
const RichEditor = lazy(() => import('../content/RichEditor.js'));
import { columns, sizes, type TaskFields as Fields, type Entity, type Task } from '@tendly/shared';
import { useTranslation } from 'react-i18next';
export type Member = { id: string; name: string; email: string; role: 'admin' | 'member' };
export const emptyTask: Fields = { parentId: null, inherit: [], placeExclusions: [], resourceExclusions: [], tagExclusions: [], blockers: [], related: [], title: '', description: '', column: 'someday', epicId: null, high: false, size: null, estimateMinutes: null, startDate: null, startTime: null, deadlineDate: null, deadlineTime: null, assignees: [], places: [], resources: [], tags: [] };
export function TaskFields({ value: local, onChange: update, entities, members, timezone, inheritance, showDates = true, upload, disabled = false, section = 'all' }: {
  section?: 'all' | 'description' | 'properties'; value: Fields; onChange: (changes: Partial<Fields>) => void; entities: Entity[]; members: Member[]; timezone: string; inheritance?: Task; showDates?: boolean; disabled?: boolean; upload?: (files: File[]) => Promise<string[]>;
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
  const description = <div className="task-description"><span className="field-label icon-label"><AlignLeft size={18} aria-hidden="true" />{t('description')}</span><Suspense fallback={<p>{t('loading')}</p>}><RichEditor disabled={disabled} value={value.description} onChange={description => onChange({ description })} members={members} label={t('description')} upload={upload} /></Suspense></div>;
  if (section === 'description') return description;
  return <>
    <div className="form-grid">
      <label>{t('column')}<select value={value.column} onChange={e => onChange({ column: e.target.value as Fields['column'] })}>{columns.map(c => <option key={c} value={c}>{t('column_' + c)}</option>)}</select></label>
      <label>{t('epic')}<select value={value.epicId ?? ''} onChange={e => onChange({ epicId: e.target.value || null })}><option value="">{t('noEpic')}</option>{entities.filter(e => e.kind === 'epic' && (!e.archived || e.id === value.epicId)).map(e => <option key={e.id} value={e.id}>{e.name}{e.archived ? ' · ' + t('archived') : ''}</option>)}</select></label>
    </div>
    {mode('epicId')}
    <fieldset className="size-selector"><legend className="icon-label"><Ruler size={18} aria-hidden="true" />{t('size')}</legend><div className="size-options">
      {sizes.map(size => <button type="button" key={size} aria-pressed={value.size === size} onClick={() => onChange({ size: value.size === size ? null : size })}>{size}</button>)}
    </div></fieldset>
    <button type="button" className="priority-toggle" aria-pressed={value.high} onClick={() => onChange({ high: !value.high })}><CircleAlert size={18} aria-hidden="true" />{t('high')}</button>
    {mode('high')}
    {section === 'all' && description}
    <Section title={t('assignees')} icon={UsersRound}>{mode('assignees')}<div className="choice-list">{members.map(member => <label className="check-label" key={member.id}><input type="checkbox" checked={value.assignees.includes(member.id)} onChange={e => onChange({ assignees: e.target.checked ? [...value.assignees, member.id].sort() : value.assignees.filter(id => id !== member.id) })} />{member.name}</label>)}</div></Section>
    {showDates && <Section title={t('dates')} icon={CalendarDays} className="date-section">
      {mode('startDate')}<div className="date-row"><label>{t('startDate')}<input type="date" value={value.startDate ?? ''} onChange={e => onChange({ startDate: e.target.value || null, ...(e.target.value ? {} : { startTime: null }) })} /></label><label>{t('startTime')}<input type="time" disabled={!value.startDate} value={value.startTime ?? ''} onChange={e => onChange({ startTime: e.target.value || null })} /></label></div>
      {mode('deadlineDate')}<div className="date-row"><label>{t('deadlineDate')}<input type="date" value={value.deadlineDate ?? ''} onChange={e => onChange({ deadlineDate: e.target.value || null, ...(e.target.value ? {} : { deadlineTime: null }) })} /></label><label>{t('deadlineTime')}<input type="time" disabled={!value.deadlineDate} value={value.deadlineTime ?? ''} onChange={e => onChange({ deadlineTime: e.target.value || null })} /></label></div>
      <p className="small muted date-hint">{t('dateZone', { zone: timezone })}</p>
    </Section>}
    <Section title={t('planningDetails')} icon={SlidersHorizontal}>
      <label><span className="icon-label"><Clock3 size={16} aria-hidden="true" />{t('estimate')}</span><input type="number" min={1} max={525600} value={value.estimateMinutes ?? ''} onChange={e => onChange({ estimateMinutes: e.target.value ? Number(e.target.value) : null })} /></label><p className="small muted">{t('estimateHelp')}</p>
      {(['places', 'resources', 'tags'] as const).map((field, index) => {
        const exclusion = (['placeExclusions', 'resourceExclusions', 'tagExclusions'] as const)[index]!;
        const Icon = [MapPin, Wrench, Tags][index]!;
        return <div key={field}><h4 className="icon-label"><Icon size={16} aria-hidden="true" />{t(field)}</h4>
          {local.parentId && <p className="small muted">{t('itemInheritanceHelp')}</p>}
          <div className="choice-list">{entities.filter(e => e.kind === ['place', 'resource', 'tag'][index] && (!e.archived || value[field].includes(e.id))).map(entity => local.parentId ? <label key={entity.id}>{entity.name}<select aria-label={entity.name + ' · ' + t(field)} value={local[field].includes(entity.id) ? 'add' : local[exclusion].includes(entity.id) ? 'exclude' : 'inherit'} onChange={e => update({
            [field]: [...local[field].filter(id => id !== entity.id), ...(e.target.value === 'add' ? [entity.id] : [])].sort(),
            [exclusion]: [...local[exclusion].filter(id => id !== entity.id), ...(e.target.value === 'exclude' ? [entity.id] : [])].sort(),
          })}><option value="inherit">{t(inheritance?.inheritedValues[field].includes(entity.id) ? 'inherited' : 'followParent')}</option><option value="add">{t('alwaysInclude')}</option><option value="exclude">{t('excludeItem')}</option></select></label> : <label key={entity.id} className="check-label"><input type="checkbox" checked={value[field].includes(entity.id)} onChange={e => onChange({ [field]: e.target.checked ? [...value[field], entity.id].sort() : value[field].filter(id => id !== entity.id) })} />{entity.name}</label>)}</div>
          {inheritance && local.parentId && <p className="small">{t('effectiveNow')}: {inheritance[field].map(id => entities.find(e => e.id === id)?.name).filter(Boolean).join(', ') || t('none')}</p>}
        </div>;
      })}

    </Section>
  </>;
}
