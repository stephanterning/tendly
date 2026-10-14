import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { iconNames } from '@tendly/shared';
import { EntityIcon, icons } from './identity.js';
const aliases: Record<string, string> = {
  trailer: 'släp släpvagn kärra transport', 'trailer-covered': 'trailer släp släpvagn kåpsläp täckt',
  caravan: 'trailer husvagn camping', truck: 'lastbil transport', tractor: 'traktor',
  dog: 'hund djur', cat: 'katt djur', fish: 'fisk djur', bird: 'fågel djur',
  trees: 'träd skog trädgård', flower: 'blomma trädgård', shovel: 'spade trädgård',
  drill: 'borr borrmaskin verktyg', hammer: 'hammare verktyg', wrench: 'skiftnyckel verktyg',
  sofa: 'soffa möbel', bath: 'bad badkar badrum', lamp: 'lampa belysning',
};
const preferred = [...Object.keys(icons), 'trailer', 'trailer-covered', 'caravan'];
const catalog = [...preferred, ...iconNames.filter(name => !preferred.includes(name))] as (typeof iconNames[number])[];
export function IconPicker({ value, onChange }: { value: typeof iconNames[number]; onChange: (value: typeof iconNames[number]) => void }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(48);
  const label = (name: string) => t('icon_' + name, { defaultValue: name.replaceAll('-', ' ') });
  const words = search.trim().toLocaleLowerCase().split(/\s+/);
  const matches = catalog.filter(name => words.every(word => (name.replaceAll('-', ' ') + ' ' + label(name) + ' ' + (aliases[name] ?? '')).toLocaleLowerCase().includes(word)));
  return <div>
    <label>{t('findIcon')}<input type="search" value={search} onChange={e => { setSearch(e.target.value); setLimit(48); }} /></label>
    <p className="small muted" role="status">{t('iconResults', { count: matches.length, total: catalog.length })}</p>
    <div className="icon-picker" role="group" aria-label={t('icon')}>{matches.slice(0, limit).map(name => <button type="button" key={name} title={label(name)} aria-label={label(name)} aria-pressed={value === name} onClick={() => onChange(name)}><EntityIcon name={name} size={21} /></button>)}</div>
    {matches.length === 0 && <p>{t('noIcons')}</p>}
    {matches.length > limit && <button type="button" onClick={() => setLimit(limit + 48)}>{t('moreIcons')}</button>}
  </div>;
}
