import type { MachineCheck } from '@modig/shared';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { errorMessage } from '../../lib/api';
import { useCurrentUser } from '../../lib/useMe';
import { localDate } from '../inspections/dates';
import { inspectionHref } from '../inspections/listFilter';
import { checkTitle } from './model';
import { useStartCheck } from './queries';

type Startable = Pick<MachineCheck, 'id' | 'kind'>;

/**
 * Starting a machine's check, wherever it is offered (the machine's page, the start pages, the
 * check's own page): its number, today's date and the person starting it as Checked by, then its
 * page. The final inspection warns first when the machine's quality checks are not all finalised,
 * and starts anyway if asked to. Render `dialog`; `error` is the last start's failure.
 */
export function useStartFlow(machineName: string, checks: readonly MachineCheck[] | undefined) {
  const navigate = useNavigate();
  const me = useCurrentUser();
  const start = useStartCheck();
  const [warning, setWarning] = useState<Startable | null>(null);
  const open = (checks ?? []).filter(
    (check) => check.kind === 'quality' && check.state !== 'finalised',
  );
  const quality = (checks ?? []).filter((check) => check.kind === 'quality');

  function go(check: Startable) {
    start.mutate(
      { id: check.id, request: { date: localDate(), participants: [me.name || me.email] } },
      { onSuccess: () => navigate(inspectionHref(check.kind, check.id)) },
    );
  }

  return {
    /** Starts it, or asks first for a final inspection ahead of its quality checks. */
    start: (check: Startable) => {
      start.reset();
      if (check.kind === 'final' && open.length > 0) setWarning(check);
      else go(check);
    },
    /** The check being started, if any. */
    starting: start.isPending ? start.variables.id : null,
    error: start.isError ? `It could not be started. ${errorMessage(start.error)}` : null,
    dialog: warning && (
      <ConfirmDialog
        title="Start the final inspection?"
        message={`${open.length} of ${quality.length} quality checks of ${machineName} ${
          open.length === 1 ? 'is' : 'are'
        } not finalised: ${open.map(checkTitle).join(', ')}. The final inspection can start anyway.`}
        confirmLabel="Start anyway"
        confirmVariant="primary"
        onConfirm={() => {
          const check = warning;
          setWarning(null);
          go(check);
        }}
        onCancel={() => setWarning(null)}
      />
    ),
  };
}
