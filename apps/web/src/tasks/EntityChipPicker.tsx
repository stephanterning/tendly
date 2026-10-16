import { useId, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Check, Link2, Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { resolveCollection, type Entity } from '@tendly/shared';
import { EntityIcon, epicStyle } from './identity.js';

type Mode = 'inherit' | 'add' | 'exclude';
export function EntityChipPicker({ field, entities, additions, exclusions, parentValues, hasParent, disabled, onChange }: {
  field: 'places' | 'resources' | 'tags'; entities: Entity[]; additions: string[]; exclusions: string[];
  parentValues: string[]; hasParent: boolean; disabled: boolean;
  onChange: (additions: string[], exclusions: string[]) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false), [search, setSearch] = useState('');
  const headingId = useId(), searchInput = useRef<HTMLInputElement>(null);
  // Reuse the server's collection operation for draft feedback, never traverse ancestors here.
  const selected = resolveCollection(parentValues, additions, exclusions);
  const options = entities.filter(entity => !entity.archived || selected.includes(entity.id) || additions.includes(entity.id) || exclusions.includes(entity.id));
  const matches = options.filter(entity => entity.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  function change(id: string, mode: Mode) {
    onChange([...additions.filter(item => item !== id), ...(mode === 'add' ? [id] : [])].sort(),
      [...exclusions.filter(item => item !== id), ...(mode === 'exclude' ? [id] : [])].sort());
  }
  function toggle(id: string) {
    // Removing from a child is an exclusion, so later parent edits cannot re-add it unexpectedly.
    change(id, selected.includes(id) ? hasParent ? 'exclude' : 'inherit' : 'add');
  }
  const title = t('choose_' + field);
  return <Popover.Root open={open} onOpenChange={next => { setOpen(next); if (!next) setSearch(''); }} modal>
    <div className="entity-chips" role="group" aria-label={t(field)}>
      {entities.filter(entity => selected.includes(entity.id)).map(entity => <button key={entity.id} type="button" className="entity-chip" style={epicStyle(entity)} disabled={disabled} aria-label={t('removeEntity', { name: entity.name })} onClick={() => toggle(entity.id)}>
        <EntityIcon name={entity.icon} size={16} /><span>{entity.name}</span>
        {parentValues.includes(entity.id) && !additions.includes(entity.id) && <Link2 size={14} aria-label={t('inherited')} />}
        <X size={14} aria-hidden="true" />
      </button>)}
      <Popover.Trigger type="button" className="entity-chip-add" disabled={disabled} aria-label={title} title={title}><Plus size={20} aria-hidden="true" /></Popover.Trigger>
    </div>
    <Popover.Portal><Popover.Content className="assignee-popover entity-picker" side="bottom" align="end" sideOffset={8} collisionPadding={16} aria-labelledby={headingId} onOpenAutoFocus={event => { event.preventDefault(); searchInput.current?.focus({ preventScroll: true }); }}>
      <div className="assignee-picker-heading"><h3 id={headingId}>{title}</h3><Popover.Close type="button" className="icon-button quiet" aria-label={t('close')}><X size={20} /></Popover.Close></div>
      <input ref={searchInput} type="search" aria-label={t('searchEntities')} placeholder={t('searchEntities')} value={search} onChange={event => setSearch(event.target.value)} />
      <div className="entity-picker-options">{matches.map(entity => <div key={entity.id} className="entity-picker-option">
        <button type="button" className="quiet entity-picker-toggle" disabled={disabled} aria-pressed={selected.includes(entity.id)} onClick={() => toggle(entity.id)}>
          <EntityIcon name={entity.icon} size={18} /><span>{entity.name}{entity.archived && <small> · {t('archived')}</small>}</span>
          {selected.includes(entity.id) ? <Check size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}
        </button>
        {hasParent && <select disabled={disabled} aria-label={entity.name + ' · ' + t(field)} value={additions.includes(entity.id) ? 'add' : exclusions.includes(entity.id) ? 'exclude' : 'inherit'} onChange={event => change(entity.id, event.target.value as Mode)}>
          <option value="inherit">{t(parentValues.includes(entity.id) ? 'inherited' : 'followParent')}</option><option value="add">{t('alwaysInclude')}</option><option value="exclude">{t('excludeItem')}</option>
        </select>}
      </div>)}</div>
      {!matches.length && <p className="small muted">{t(search ? 'noMatchingEntities' : 'noEntities')}</p>}
      {hasParent && <p className="small muted">{t('itemInheritanceHelp')}</p>}
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
