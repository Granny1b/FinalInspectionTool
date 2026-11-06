import type { InspectionKind, MachineModel } from '@modig/shared';
import { ClipboardCheck, Plus, SearchX, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { Button, ButtonLink } from '../components/Button';
import { Callout } from '../components/Callout';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { LoadError, PageLoading } from '../components/PageStates';
import { InspectionFilters } from '../features/inspections/InspectionFilters';
import { InspectionList } from '../features/inspections/InspectionList';
import {
  filterFromParams,
  filterInspections,
  filterToParams,
  isFiltered,
  rememberListSearch,
  type InspectionFilter,
  type InspectionsPageState,
} from '../features/inspections/listFilter';
import { useInspections } from '../features/inspections/queries';
import { useMachines } from '../features/machines/queries';
import { errorMessage } from '../lib/api';
import { modelName, useSettings } from '../lib/useSettings';

const BY_NAME = new Intl.Collator('sv', { numeric: true });

/** What each list says. */
const WORDS = {
  final: {
    title: 'Inspections',
    description: 'Final inspections of machines before delivery, newest first.',
    create: { to: '/inspections/new', label: 'New final inspection' },
    icon: ClipboardCheck,
    loading: 'Loading inspections…',
    loadError: "We couldn't load the inspections",
    emptyTitle: 'No inspections yet',
    emptyHint: 'Start one on a machine, print it for the walk-round, then enter the results here.',
    noMatch: 'No inspections match',
    one: 'inspection',
    many: 'inspections',
  },
  quality: {
    title: 'Quality checks',
    description: 'Quality checks done on machines along the build, newest first.',
    create: { to: '/quality-checks/new', label: 'Start a quality check' },
    icon: ShieldCheck,
    loading: 'Loading quality checks…',
    loadError: "We couldn't load the quality checks",
    emptyTitle: 'No quality checks done yet',
    emptyHint: 'Start one on a machine, then mark each row OK, NOK or N/A on a tablet or PC.',
    noMatch: 'No quality checks match',
    one: 'quality check',
    many: 'quality checks',
  },
} as const;

/**
 * `/inspections`, the final inspections, or `/quality-checks`, the quality checks done on
 * machines: one list of each kind, searched and filtered alike.
 */
export function InspectionsPage({ kind = 'final' }: { kind?: InspectionKind }) {
  const words = WORDS[kind];
  const inspections = useInspections(kind);
  const settings = useSettings();
  // Offered in the search box; without them it searches words only.
  const machines = useMachines();
  const [params, setParams] = useSearchParams();
  const filter = filterFromParams(params);
  // Typing in the search box replaces the history entry instead of adding one per key. Rendered at
  // once (not as the router's default transition), so a change made right after another (typing,
  // then picking a model) builds on it, and the search box never shows an outdated value.
  const setFilter = (next: InspectionFilter) =>
    setParams(filterToParams(next), { replace: true, flushSync: true });
  // The inspection pages' "← Inspections" links come back to the same search and filters.
  const search = filterToParams(filter).toString();
  useEffect(() => rememberListSearch(search, kind), [search, kind]);
  // An admin just deleted an inspection on its page, which brought them here.
  const location = useLocation();
  const navigate = useNavigate();
  const deleted = (location.state as InspectionsPageState | null)?.deleted;

  const all = inspections.data;
  const shown = all ? filterInspections(all, filter) : [];
  const models = useMemo(
    () => modelsIn(all ?? [], settings.data?.machineModels),
    [all, settings.data?.machineModels],
  );
  // A model from a shared link stays selectable even when none of its inspections exist any more.
  const modelOptions =
    filter.model && !models.some((model) => model.code === filter.model)
      ? [
          ...models,
          { code: filter.model, name: modelName(settings.data?.machineModels, filter.model) },
        ]
      : models;

  const newInspection = (
    <ButtonLink to={words.create.to}>
      <Plus size={16} aria-hidden="true" />
      {words.create.label}
    </ButtonLink>
  );
  const plural = (count: number) => `${count} ${count === 1 ? words.one : words.many}`;

  return (
    <>
      <PageHeader
        title={words.title}
        description={words.description}
        actions={all?.length ? newInspection : undefined}
      />
      {deleted && (
        <div className="mb-6">
          <Callout
            tone="success"
            role="status"
            // Out of the history entry too (search and filters kept), so a reload doesn't bring
            // it back.
            onDismiss={() =>
              void navigate(
                { pathname: location.pathname, search: location.search },
                { replace: true, state: null },
              )
            }
          >
            <strong className="font-semibold">{deleted} was deleted.</strong>
          </Callout>
        </div>
      )}
      {inspections.isPending ? (
        <PageLoading label={words.loading} header={false} />
      ) : inspections.isError ? (
        <LoadError
          title={words.loadError}
          message={errorMessage(inspections.error)}
          onRetry={() => void inspections.refetch()}
          retrying={inspections.isFetching}
        />
      ) : inspections.data.length === 0 ? (
        <EmptyState
          icon={words.icon}
          title={words.emptyTitle}
          hint={words.emptyHint}
          action={newInspection}
        />
      ) : (
        <div className="space-y-4">
          <InspectionFilters
            kind={kind}
            filter={filter}
            models={modelOptions}
            machines={(machines.data ?? []).filter(
              (machine) => !filter.model || machine.modelCode === filter.model,
            )}
            machineModels={settings.data?.machineModels}
            onChange={setFilter}
          />
          {/* Announced, so a screen reader hears what a search or filter left. */}
          <p role="status" className="text-xs text-ink-500">
            {isFiltered(filter)
              ? `${shown.length} of ${plural(inspections.data.length)}`
              : plural(inspections.data.length)}
          </p>
          {shown.length > 0 ? (
            <InspectionList kind={kind} inspections={shown} models={settings.data?.machineModels} />
          ) : (
            <EmptyState
              icon={SearchX}
              title={words.noMatch}
              hint="Try other words, or another machine, model or state."
              action={
                <Button
                  variant="secondary"
                  onClick={() => setFilter({ query: '', model: '', machine: '', state: '' })}
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

/** The models inspections exist for, by name: filtering by any other would show nothing. */
function modelsIn(
  inspections: readonly { modelCode: string }[],
  known: readonly MachineModel[] | undefined,
): MachineModel[] {
  const codes = new Set(inspections.map((inspection) => inspection.modelCode));
  return [...codes]
    .map((code) => ({ code, name: modelName(known, code) }))
    .sort((a, b) => BY_NAME.compare(a.name, b.name));
}
