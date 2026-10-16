import { useId, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Member } from './TaskFields.js';

function Avatar({ member }: { member: Member }) {
  const [failed, setFailed] = useState(false);
  const words = member.name.trim().split(/\s+/);
  const initials = (words[0]?.[0] ?? '') + (words.length > 1 ? words.at(-1)?.[0] ?? '' : '');
  return <span className="member-avatar" aria-hidden="true">{member.avatar && !failed
    ? <img src={member.avatar} alt="" onError={() => setFailed(true)} />
    : initials.toLocaleUpperCase()}</span>;
}

export function AssigneePicker({ value, members, onChange, disabled }: { value: string[]; members: Member[]; onChange: (ids: string[]) => void; disabled: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false), [search, setSearch] = useState('');
  const headingId = useId(), searchInput = useRef<HTMLInputElement>(null);
  const selected = members.filter(member => value.includes(member.id));
  const matches = members.filter(member => member.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  function toggle(id: string) {
    // Pass the complete selection through the existing inheritance/override handler.
    onChange(value.includes(id) ? value.filter(item => item !== id) : [...value, id].sort());
  }
  return <Popover.Root open={open} onOpenChange={next => { setOpen(next); if (!next) setSearch(''); }} modal>
    <div className="assignee-avatars" role="group" aria-label={t('assignees')}>
      {selected.map(member => <button key={member.id} type="button" className="avatar-trigger quiet" disabled={disabled} title={member.name} aria-label={t('editAssignee', { name: member.name })} onClick={() => setOpen(true)}><Avatar member={member} /></button>)}
      <Popover.Trigger type="button" className="assignee-add" disabled={disabled} aria-label={t('chooseAssignees')} title={t('chooseAssignees')}><Plus size={24} aria-hidden="true" /></Popover.Trigger>
    </div>
    <Popover.Portal><Popover.Content className="assignee-popover" side="bottom" align="end" sideOffset={8} collisionPadding={16} aria-labelledby={headingId} onOpenAutoFocus={event => { event.preventDefault(); searchInput.current?.focus({ preventScroll: true }); }}>
      <div className="assignee-picker-heading"><h3 id={headingId}>{t('chooseAssignees')}</h3><Popover.Close type="button" className="icon-button quiet" aria-label={t('close')}><X size={20} /></Popover.Close></div>
      <input ref={searchInput} type="search" aria-label={t('searchMembers')} placeholder={t('searchMembers')} value={search} onChange={event => setSearch(event.target.value)} />
      {([true, false] as const).map(assigned => <section key={String(assigned)} className="assignee-picker-group"><h4>{t(assigned ? 'selectedMembers' : 'otherMembers')}</h4>
        {matches.filter(member => value.includes(member.id) === assigned).map(member => <button key={member.id} type="button" className="assignee-choice quiet" disabled={disabled} aria-label={t(assigned ? 'removeAssignee' : 'addAssignee', { name: member.name })} onClick={() => toggle(member.id)}><Avatar member={member} /><span>{member.name}</span>{assigned ? <X size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}</button>)}
        {!matches.some(member => value.includes(member.id) === assigned) && <p className="muted small">{t(search ? 'noMatchingMembers' : assigned ? 'noSelectedMembers' : 'allMembersSelected')}</p>}
      </section>)}
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
