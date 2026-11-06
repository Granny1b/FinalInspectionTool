import { hasRole, MACHINE_STAGE_LABELS, MACHINE_STAGES, type MachineModel } from '@modig/shared';
import clsx from 'clsx';
import { Factory, Link2, Plus, Search, SearchX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button, ButtonLink } from '../components/Button';
import { Callout } from '../components/Callout';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { INPUT } from '../components/Field';
import { PageHeader } from '../components/PageHeader';
import { LoadError, PageLoading } from '../components/PageStates';
import { useInspections } from '../features/inspections/queries';
import { MachineList } from '../features/machines/MachineList';
import {
  filterFromParams,
  filterMachines,
  filterToParams,
  isFiltered,
  type MachineFilter,
} from '../features/machines/model';
import { useMachines, useMachinesFromInspections } from '../features/machines/queries';
import { errorMessage } from '../lib/api';
import { useCurrentUser } from '../lib/useMe';
import { modelName, useSettings } from '../lib/useSettings';

const BY_NAME = new Intl.Collator('sv', { sensitivity: 'base', numeric: true });

/**
 * `/machines`: the machines being built, each with its own quality checks and final inspection,
 * and where each one is ("In build · QC 3/5", "Ready for final inspection", "Done"). Searched by
 * Machine ID or serial number and filtered by model and status, kept in the address.
 */
export function MachinesPage() {
  const machines = useMachines();
  const settings = useSettings();
  const isAdmin = hasRole(useCurrentUser().roles, 'admin');
  const [params, setParams] = useSearchParams();
  const filter = filterFromParams(params);
  const setFilter = (next: MachineFilter) =>
    setParams(filterToParams(next), { replace: true, flushSync: true });
  const models = settings.data?.machineModels;

  const all = machines.data;
  const shown = all ? filterMachines(all, filter, models) : [];
  const modelOptions = useMemo(() => modelsIn(all ?? [], models), [all, models]);

  const newMachine = (
    <ButtonLink to="/machines/new">
      <Plus size={16} aria-hidden="true" />
      New machine
    </ButtonLink>
  );
  const plural = (count: number) => `${count} ${count === 1 ? 'machine' : 'machines'}`;

  return (
    <>
      <PageHeader
        title="Machines"
        description="The machines being built, each with its own quality checks and final inspection."
        actions={newMachine}
      />
      {isAdmin && <FromInspections />}
      {machines.isPending ? (
        <PageLoading label="Loading machines…" header={false} />
      ) : machines.isError ? (
        <LoadError
          title="We couldn't load the machines"
          message={errorMessage(machines.error)}
          onRetry={() => void machines.refetch()}
          retrying={machines.isFetching}
        />
      ) : machines.data.length === 0 ? (
        <EmptyState
          icon={Factory}
          title="No machines yet"
          hint="Make one for each machine you build, with the quality checks and the final inspection it gets. They are started from its page."
          action={newMachine}
        />
      ) : (
        <div className="space-y-4">
          <div role="search" className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-auto sm:min-w-64 sm:flex-1">
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
                value={filter.query}
                onChange={(event) => setFilter({ ...filter, query: event.target.value })}
                className={clsx(INPUT, 'h-9 pl-9')}
              />
            </div>
            <div className="w-full sm:w-40">
              <select
                aria-label="Machine model"
                value={filter.model}
                onChange={(event) => setFilter({ ...filter, model: event.target.value })}
                className={clsx(INPUT, 'h-9')}
              >
                <option value="">All models</option>
                {modelOptions.map((model) => (
                  <option key={model.code} value={model.code}>
                    {model.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-full sm:w-56">
              <select
                aria-label="Status"
                value={filter.stage}
                onChange={(event) =>
                  setFilter({ ...filter, stage: event.target.value as MachineFilter['stage'] })
                }
                className={clsx(INPUT, 'h-9')}
              >
                <option value="">All statuses</option>
                {MACHINE_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {MACHINE_STAGE_LABELS[stage]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p role="status" className="text-xs text-ink-500">
            {isFiltered(filter)
              ? `${shown.length} of ${plural(machines.data.length)}`
              : plural(machines.data.length)}
          </p>
          {shown.length > 0 ? (
            <MachineList machines={shown} models={models} />
          ) : (
            <EmptyState
              icon={SearchX}
              title="No machines match"
              hint="Try other words, or another model or status."
              action={
                <Button
                  variant="secondary"
                  onClick={() => setFilter({ query: '', model: '', stage: '' })}
                >
                  Clear search and filters
                </Button>
              }
            />
          )}
        </div>
      )}
    </>
  );
}

/** The models machines exist for, by name: filtering by any other would show nothing. */
function modelsIn(
  machines: readonly { modelCode: string }[],
  known: readonly MachineModel[] | undefined,
): MachineModel[] {
  return [...new Set(machines.map((machine) => machine.modelCode))]
    .map((code) => ({ code, name: modelName(known, code) }))
    .sort((a, b) => BY_NAME.compare(a.name, b.name));
}

/**
 * Admins: the inspections and quality checks done before machines existed, which belong to no
 * machine yet, and the one-time action that makes machines for them. Shown while there are any.
 */
function FromInspections() {
  const finals = useInspections('final');
  const checks = useInspections('quality');
  const run = useMachinesFromInspections();
  const [confirming, setConfirming] = useState(false);
  const unlinked = [...(finals.data ?? []), ...(checks.data ?? [])].filter(
    (inspection) => !inspection.machineRef,
  ).length;
  const result = run.data;

  if (result) {
    return (
      <div className="mb-6">
        <Callout tone="success" role="status" onDismiss={() => run.reset()}>
          <strong className="font-semibold">
            {result.created === 1 ? '1 machine made' : `${result.created} machines made`},{' '}
            {result.linked === 1 ? '1 inspection linked' : `${result.linked} inspections linked`}.
          </strong>{' '}
          {result.unmatched > 0 &&
            `${result.unmatched} matched no machine (no Machine ID, or one of another model): they work as before and can be linked from their page.`}
        </Callout>
      </div>
    );
  }
  if (unlinked === 0) return null;
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-ink-200 bg-surface px-4 py-3">
      <Link2 size={18} aria-hidden="true" className="shrink-0 text-brand-600" />
      <p className="min-w-0 flex-1 text-sm text-ink-700">
        {unlinked === 1
          ? '1 inspection or quality check done before machines existed belongs to no machine.'
          : `${unlinked} inspections and quality checks done before machines existed belong to no machine.`}
      </p>
      <Button variant="secondary" onClick={() => setConfirming(true)} disabled={run.isPending}>
        {run.isPending ? 'Making machines…' : 'Create machines from existing inspections'}
      </Button>
      {run.isError && (
        <p role="alert" className="w-full text-sm font-medium text-nok-fg">
          {errorMessage(run.error)}
        </p>
      )}
      {confirming && (
        <ConfirmDialog
          title="Create machines from existing inspections?"
          message="One machine is made for each Machine ID and model among them, and each inspection is linked to its machine. Those in progress take the machine’s Machine ID and serial number; finalised ones keep theirs. Inspections without a Machine ID stay as they are."
          confirmLabel="Create machines"
          confirmVariant="primary"
          onConfirm={() => {
            setConfirming(false);
            run.mutate();
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
