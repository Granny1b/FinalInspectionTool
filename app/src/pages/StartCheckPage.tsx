import { hasRole, type InspectionKind } from '@modig/shared';
import clsx from 'clsx';
import { Factory, Plus, Search } from 'lucide-react';
import { useId, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { BackLink } from '../components/BackLink';
import { ButtonLink } from '../components/Button';
import { Callout } from '../components/Callout';
import { EmptyState } from '../components/EmptyState';
import { INPUT } from '../components/Field';
import { PageHeader } from '../components/PageHeader';
import { LoadError, PageLoading } from '../components/PageStates';
import { inspectionsListHref } from '../features/inspections/listFilter';
import { CheckSection } from '../features/machines/MachineChecks';
import { MachineStatusBadge } from '../features/machines/MachineStatus';
import { filterMachines, machineHref, nextCheck } from '../features/machines/model';
import { useMachine, useMachines } from '../features/machines/queries';
import { useStartFlow } from '../features/machines/useStartFlow';
import { errorMessage } from '../lib/api';
import { useCurrentUser } from '../lib/useMe';
import { modelName, useSettings } from '../lib/useSettings';

const WORDS = {
  final: {
    title: 'New final inspection',
    description: 'Pick the machine, then start its final inspection.',
    back: 'Inspections',
    empty: 'No final inspection on this machine yet. Add it on the machine’s page.',
  },
  quality: {
    title: 'Start a quality check',
    description: 'Pick the machine, then which of its quality checks to start.',
    back: 'Quality checks',
    empty: 'No quality checks on this machine. Add one on the machine’s page.',
  },
} as const;

/**
 * `/inspections/new` and `/quality-checks/new`: checks are started on a machine, so first the
 * machine (or a new one), then its check of this kind. The machine picked is kept in the address
 * (`?machine=`), so coming back finds it.
 */
export function StartCheckPage({ kind }: { kind: InspectionKind }) {
  const words = WORDS[kind];
  const machines = useMachines();
  const settings = useSettings();
  const [params, setParams] = useSearchParams();
  const picked = params.get('machine');
  const [query, setQuery] = useState('');
  const listId = useId();

  const newMachine = (
    <ButtonLink to="/machines/new" variant="secondary">
      <Plus size={16} aria-hidden="true" />
      New machine
    </ButtonLink>
  );

  let body;
  if (machines.isPending) {
    body = <PageLoading label="Loading machines…" header={false} />;
  } else if (machines.isError) {
    body = (
      <LoadError
        title="We couldn't load the machines"
        message={errorMessage(machines.error)}
        onRetry={() => void machines.refetch()}
        retrying={machines.isFetching}
      />
    );
  } else if (machines.data.length === 0) {
    body = (
      <EmptyState
        icon={Factory}
        title="No machines yet"
        hint="Checks are done on a machine: make it first, with the checks it gets."
        action={newMachine}
      />
    );
  } else {
    const shown = filterMachines(
      machines.data,
      { query, model: '', stage: '' },
      settings.data?.machineModels,
    );
    body = (
      <div className="space-y-6">
        <section aria-labelledby={listId} className="rounded-lg border border-ink-200 bg-surface">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-200 px-5 py-3.5">
            <div className="min-w-0">
              <h2 id={listId} className="text-sm font-semibold text-ink-900">
                Machine
              </h2>
              <p className="mt-0.5 text-xs text-ink-500">
                Each machine has its own copy of its checks.
              </p>
            </div>
            {newMachine}
          </div>
          <div className="p-5">
            <div className="relative">
              <Search
                size={16}
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-500"
              />
              <input
                type="search"
                aria-label="Search machines"
                placeholder="Machine ID or S/N"
                autoComplete="off"
                spellCheck={false}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className={clsx(INPUT, 'h-9 pl-9')}
              />
            </div>
            <fieldset className="mt-3">
              <legend className="sr-only">Machine</legend>
              {shown.length === 0 ? (
                <p className="py-3 text-sm text-ink-500">No machine matches.</p>
              ) : (
                <div className="grid max-h-[26rem] gap-2 overflow-y-auto p-0.5 sm:grid-cols-2">
                  {shown.map((machine) => (
                    <label
                      key={machine.id}
                      className="flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border border-ink-200 px-4 py-3 transition-colors hover:border-ink-300 hover:bg-ink-50 has-checked:border-brand-600 has-checked:bg-brand-50 has-focus-visible:outline-2 has-focus-visible:-outline-offset-1 has-focus-visible:outline-brand-600"
                    >
                      <input
                        type="radio"
                        name="machine"
                        checked={picked === machine.id}
                        onChange={() =>
                          setParams({ machine: machine.id }, { replace: true, flushSync: true })
                        }
                        className="mt-0.5 size-4 shrink-0 accent-brand-600 focus-visible:outline-none"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium wrap-anywhere text-ink-900">
                          {machine.machineName}
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-500">
                          {modelName(settings.data?.machineModels, machine.modelCode)} · S/N{' '}
                          {machine.serialNumber}
                        </span>
                        <span className="mt-1.5 block">
                          <MachineStatusBadge progress={machine.progress} />
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          </div>
        </section>
        {picked && <PickedMachine id={picked} kind={kind} />}
      </div>
    );
  }

  return (
    <>
      <BackLink to={inspectionsListHref(kind)} label={words.back} />
      <div className="mt-2">
        <PageHeader title={words.title} description={words.description} />
      </div>
      {body}
    </>
  );
}

/** The picked machine's checks of the kind, to start or open. */
function PickedMachine({ id, kind }: { id: string; kind: InspectionKind }) {
  const machine = useMachine(id);
  const isAdmin = hasRole(useCurrentUser().roles, 'admin');
  const flow = useStartFlow(
    machine.data?.detail.machine.machineName ?? '',
    machine.data?.detail.checks,
  );
  if (machine.isPending)
    return <PageLoading label="Loading the machine’s checks…" header={false} />;
  if (machine.isError) {
    return (
      <LoadError
        title="We couldn't load the machine’s checks"
        message={errorMessage(machine.error)}
        onRetry={() => void machine.refetch()}
        retrying={machine.isFetching}
      />
    );
  }
  const { detail } = machine.data;
  return (
    <div className="space-y-3">
      {flow.error && (
        <Callout tone="error" role="alert">
          {flow.error}
        </Callout>
      )}
      <CheckSection
        kind={kind}
        checks={detail.checks}
        empty={WORDS[kind].empty}
        isAdmin={isAdmin}
        starting={flow.starting}
        nextId={nextCheck(detail.checks)}
        onStart={flow.start}
        // Updating and removing are done on the machine's page.
        onUpdate={() => undefined}
        onRemove={() => undefined}
        manage={false}
      />
      <p className="text-sm">
        <Link
          to={machineHref(detail.machine.id)}
          className="font-medium text-brand-700 underline-offset-2 hover:underline"
        >
          Open {detail.machine.machineName}
        </Link>
        <span className="text-ink-500"> for all its checks, to add one or edit it.</span>
      </p>
      {flow.dialog}
    </div>
  );
}
