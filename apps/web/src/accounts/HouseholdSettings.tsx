import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Account } from '@tendly/shared';
import { api, result } from './api.js';

export function HouseholdSettings({
  household,
  run,
  busy,
}: {
  household: Account['households'][number];
  run: (action: () => Promise<unknown>) => Promise<void>;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const [base, setBase] = useState(household);
  const [name, setName] = useState(household.name);
  const [timezone, setTimezone] = useState(household.timezone);
  const dirty = name !== base.name || timezone !== base.timezone;
  const remoteChanged = household.name !== base.name || household.timezone !== base.timezone;
  useEffect(() => {
    // Refetches may update the baseline only while no local draft would be lost.
    if (remoteChanged && (!dirty || (name === household.name && timezone === household.timezone))) {
      setBase(household);
      setName(household.name);
      setTimezone(household.timezone);
    }
  }, [household, remoteChanged, dirty, name, timezone]);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void run(() =>
          result(
            api.PATCH('/api/v1/households/{id}', {
              params: { path: { id: household.id } },
              body: { baseName: base.name, baseTimezone: base.timezone, name, timezone },
            }),
          ),
        );
      }}
    >
      <fieldset disabled={busy}>
        <label>
          {t('household')}
          <input
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          {t('timezone')}
          <input required value={timezone} onChange={(event) => setTimezone(event.target.value)} />
        </label>
        <div className="button-row">
          <button type="submit">{t('save')}</button>
          {remoteChanged && (
            <button
              type="button"
              onClick={() => {
                setBase(household);
                setName(household.name);
                setTimezone(household.timezone);
              }}
            >
              {t('loadLatest')}
            </button>
          )}
        </div>
      </fieldset>
    </form>
  );
}
