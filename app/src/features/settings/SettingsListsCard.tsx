import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/Button';
import { Callout } from '../../components/Callout';
import { errorMessage } from '../../lib/api';
import { useStoredSettings } from '../../lib/useSettings';
import { SettingsCard } from './SettingsCard';
import { SettingsForm } from './SettingsForm';

/**
 * Machine models, the Responsible and deviation category lists, the default location, and the
 * company name and logo on printed reports: one form, one Save.
 */
export function SettingsListsCard() {
  const stored = useStoredSettings();
  // Bumped by Reload, so the form starts again from what was loaded.
  const [opened, setOpened] = useState(0);

  async function reload(): Promise<boolean> {
    const result = await stored.refetch();
    if (!result.isSuccess) return false;
    setOpened((count) => count + 1);
    return true;
  }

  return (
    <SettingsCard
      title="Models, lists & reports"
      description="The machine models, the choices on a deviation, and what new inspections and printed reports start from."
    >
      {stored.data ? (
        <SettingsForm key={opened} loaded={stored.data} onReload={reload} />
      ) : stored.isError ? (
        <Callout
          tone="error"
          role="alert"
          actions={
            <Button
              variant="secondary"
              onClick={() => void stored.refetch()}
              disabled={stored.isFetching}
            >
              <RefreshCw
                size={16}
                aria-hidden="true"
                className={stored.isFetching ? 'animate-spin' : undefined}
              />
              {stored.isFetching ? 'Trying again…' : 'Try again'}
            </Button>
          }
        >
          <strong className="font-semibold">We couldn’t load the settings.</strong>{' '}
          {errorMessage(stored.error)}
        </Callout>
      ) : (
        <div aria-busy="true">
          <p role="status" className="sr-only">
            Loading the settings…
          </p>
          <div className="h-40 animate-pulse rounded-md bg-ink-200/70" />
        </div>
      )}
    </SettingsCard>
  );
}
