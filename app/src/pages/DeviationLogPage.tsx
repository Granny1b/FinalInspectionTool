import {
  deviationLogId,
  type DeviationLogEntry,
  type FollowUpRequest,
  type InspectionKind,
  type MachineModel,
} from '@modig/shared';
import { CircleCheck, Download, ListChecks, SearchX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '../components/Button';
import { Callout } from '../components/Callout';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { LoadError, PageLoading } from '../components/PageStates';
import { LogFilters } from '../features/deviationLog/LogFilters';
import { LogGroupCard } from '../features/deviationLog/LogGroupCard';
import { LogSummary } from '../features/deviationLog/LogSummary';
import {
  filterFromParams,
  filterToParams,
  isFiltered,
  listChoices,
  logView,
  queryOf,
  type LogFilter,
} from '../features/deviationLog/model';
import {
  downloadDeviationLog,
  useDeviationLog,
  usePendingFollowUps,
  useSetFollowUp,
} from '../features/deviationLog/queries';
import { localDate } from '../features/inspections/dates';
import { useMachines } from '../features/machines/queries';
import { errorMessage } from '../lib/api';
import { modelName, useSettings } from '../lib/useSettings';

const BY_NAME = new Intl.Collator('sv', { numeric: true });

/** What each log says. */
const WORDS = {
  final: {
    title: 'Final inspection deviations',
    description:
      'Every deviation found in final inspections, by machine: what is still open and what has been closed.',
    empty:
      'Deviations found in final inspections show up here, by machine, to be followed up until they are closed.',
  },
  quality: {
    title: 'Quality check deviations',
    description:
      'Every deviation found in quality checks along the build, by machine: what is still open and what has been closed.',
    empty:
      'Deviations found in quality checks show up here, by machine, to be followed up until they are closed.',
  },
} as const;

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/**
 * `/deviations/final` and `/deviations/quality`: the deviation log of one kind (brief: the Excel
 * log's overview of what is open and closed). The summary on top, the filters in the address, then
 * each machine with its deviations; each is closed (with what was done), edited or reopened here,
 * as on its inspection's Deviations tab.
 */
export function DeviationLogPage({ kind }: { kind: InspectionKind }) {
  const words = WORDS[kind];
  const log = useDeviationLog(kind);
  const settings = useSettings();
  const models = settings.data?.machineModels;
  // Offered in the search box; without them it searches words only.
  const machineList = useMachines();
  const [params, setParams] = useSearchParams();
  const filter = filterFromParams(params, kind);
  // Typing in the search box replaces the history entry instead of adding one per key, and is
  // rendered at once (as on the inspections list), so the box never shows an outdated value.
  const setFilter = (next: LogFilter) =>
    setParams(filterToParams(next), { replace: true, flushSync: true });
  const today = localDate();
  const entries = log.data?.entries;
  const logMachines = log.data?.machines;
  const search = params.toString();
  const view = useMemo(
    () =>
      entries
        ? logView(entries, filterFromParams(new URLSearchParams(search), kind), today, logMachines)
        : null,
    [entries, search, kind, today, logMachines],
  );

  const setFollowUp = useSetFollowUp();
  const pending = usePendingFollowUps();
  const [failure, setFailure] = useState<string | null>(null);
  // What was just done: a closed deviation leaves the list of open ones, so it says where it went.
  const [notice, setNotice] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  function followUp(entry: DeviationLogEntry, request: FollowUpRequest) {
    setFailure(null);
    setNotice(null);
    const id = deviationLogId(entry);
    const what =
      request.status === 'open' ? 'reopened' : entry.status === 'closed' ? 'changed' : 'closed';
    const listed = filter.status === 'all' || filter.status === request.status;
    setFollowUp.mutate(
      { inspectionId: entry.inspectionId, kind, key: entry.key, request },
      {
        onSuccess: () =>
          setNotice(
            what === 'changed'
              ? `${id} is saved.`
              : `${id} is ${request.status === 'open' ? 'open again' : 'closed'}.${
                  listed
                    ? ''
                    : ` It is listed under ${request.status === 'open' ? 'Open' : 'Closed'}.`
                }`,
          ),
        onError: (error) => setFailure(`${id} could not be ${what}. ${errorMessage(error)}`),
      },
    );
  }

  async function exportCsv() {
    setExporting(true);
    setExportError(null);
    try {
      await downloadDeviationLog(queryOf(filter));
    } catch (error) {
      setExportError(`The CSV could not be exported. ${errorMessage(error)}`);
    } finally {
      setExporting(false);
    }
  }

  const header = (
    <PageHeader
      title={words.title}
      description={words.description}
      actions={
        entries?.length ? (
          <Button variant="secondary" onClick={() => void exportCsv()} disabled={exporting}>
            <Download size={16} aria-hidden="true" />
            {exporting ? 'Exporting…' : 'Export CSV'}
          </Button>
        ) : undefined
      }
    />
  );

  if (log.isPending) {
    return (
      <>
        {header}
        <PageLoading label="Loading the deviations…" header={false} />
      </>
    );
  }
  if (log.isError) {
    return (
      <>
        {header}
        <LoadError
          title="We couldn't load the deviations"
          message={errorMessage(log.error)}
          onRetry={() => void log.refetch()}
          retrying={log.isFetching}
        />
      </>
    );
  }
  if (!view || log.data.entries.length === 0) {
    return (
      <>
        {header}
        <EmptyState icon={ListChecks} title="No deviations yet" hint={words.empty} />
      </>
    );
  }

  const all = log.data.entries;
  const machines = view.groups.length;
  const allClosed = filter.status === 'open' && view.summary.open === 0 && view.summary.closed > 0;

  return (
    <>
      {header}
      <div className="space-y-6">
        {log.data.unreadableRows > 0 && (
          <Callout tone="error" role="status">
            {plural(log.data.unreadableRows, 'deviation record')} could not be read and{' '}
            {log.data.unreadableRows === 1 ? 'is' : 'are'} left out.
          </Callout>
        )}
        <LogSummary
          summary={view.summary}
          resp={filter.resp}
          onResp={(resp) => setFilter({ ...filter, resp })}
        />
        <div className="space-y-3">
          <LogFilters
            filter={filter}
            models={modelOptions(all, filter.model, models)}
            machines={(machineList.data ?? []).filter(
              (machine) => !filter.model || machine.modelCode === filter.model,
            )}
            machineModels={models}
            responsibles={listChoices(all, 'resp', filter.resp)}
            categories={listChoices(all, 'category', filter.category)}
            onChange={setFilter}
          />
          {/* Announced, so a screen reader hears what a search or filter left. */}
          <p role="status" className="text-xs text-ink-500">
            {view.shown > 0
              ? `${plural(view.shown, 'deviation')} on ${plural(machines, 'machine')}`
              : 'No deviations'}
          </p>
        </div>
        {failure && (
          <Callout tone="error" role="alert" onDismiss={() => setFailure(null)}>
            {failure}
          </Callout>
        )}
        {notice && (
          <Callout tone="success" role="status" onDismiss={() => setNotice(null)}>
            {notice}
          </Callout>
        )}
        {exportError && (
          <Callout tone="error" role="alert" onDismiss={() => setExportError(null)}>
            {exportError}
          </Callout>
        )}
        {view.groups.length > 0 ? (
          <div className="space-y-4">
            {view.groups.map((group) => (
              <LogGroupCard
                key={group.key}
                kind={kind}
                group={group}
                models={models}
                today={today}
                pending={pending}
                onFollowUp={followUp}
              />
            ))}
          </div>
        ) : allClosed ? (
          <EmptyState
            icon={CircleCheck}
            title="Nothing open"
            hint={
              isFiltered(filter)
                ? `Every deviation under these filters is closed (${view.summary.closed}).`
                : `Every deviation is closed (${view.summary.closed}).`
            }
            action={
              <Button
                variant="secondary"
                onClick={() => setFilter({ ...filter, status: 'closed' })}
              >
                Show closed deviations
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={SearchX}
            title="No deviations match"
            hint="Try other words, or another status, model, responsible or category."
            action={
              <Button variant="secondary" onClick={() => setFilter({ kind, status: 'all', q: '' })}>
                Show all deviations
              </Button>
            }
          />
        )}
      </div>
    </>
  );
}

/**
 * The model filter's choices: the models with deviations of this kind, by name, plus one from a
 * shared link that has none (so the menu can show it).
 */
function modelOptions(
  entries: readonly DeviationLogEntry[],
  current: string | undefined,
  known: readonly MachineModel[] | undefined,
): MachineModel[] {
  const codes = new Set(entries.map((entry) => entry.modelCode));
  if (current) codes.add(current);
  return [...codes]
    .map((code) => ({ code, name: modelName(known, code) }))
    .sort((a, b) => BY_NAME.compare(a.name, b.name));
}
