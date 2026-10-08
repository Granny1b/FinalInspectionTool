import type { MachineModel } from '@modig/shared';
import { ClipboardCheck, Plus, SearchX } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { Button, ButtonLink } from '../components/Button';
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
} from '../features/inspections/listFilter';
import { useInspections } from '../features/inspections/queries';
import { errorMessage } from '../lib/api';
import { modelName, useSettings } from '../lib/useSettings';

const BY_NAME = new Intl.Collator('sv', { numeric: true });

export function InspectionsPage() {
  const inspections = useInspections();
  const settings = useSettings();
  const [params, setParams] = useSearchParams();
  const filter = filterFromParams(params);
  // Typing in the search box replaces the history entry instead of adding one per key. Rendered at
  // once (not as the router's default transition), so a change made right after another (typing,
  // then picking a model) builds on it, and the search box never shows an outdated value.
  const setFilter = (next: InspectionFilter) =>
    setParams(filterToParams(next), { replace: true, flushSync: true });
  // The inspection pages' "← Inspections" links come back to the same search and filters.
  const search = filterToParams(filter).toString();
  useEffect(() => rememberListSearch(search), [search]);

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
    <ButtonLink to="/inspections/new">
      <Plus size={16} aria-hidden="true" />
      New inspection
    </ButtonLink>
  );

  return (
    <>
      <PageHeader
        title="Inspections"
        description="Final inspections of machines before delivery, newest first."
        actions={all?.length ? newInspection : undefined}
      />
      {inspections.isPending ? (
        <PageLoading label="Loading inspections…" />
      ) : inspections.isError ? (
        <LoadError
          title="We couldn't load the inspections"
          message={errorMessage(inspections.error)}
          onRetry={() => void inspections.refetch()}
          retrying={inspections.isFetching}
        />
      ) : inspections.data.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No inspections yet"
          hint="Start one from a machine model’s published checklist, print it for the walk-round, then enter the results here."
          action={newInspection}
        />
      ) : (
        <div className="space-y-4">
          <InspectionFilters filter={filter} models={modelOptions} onChange={setFilter} />
          {/* Announced, so a screen reader hears what a search or filter left. */}
          <p role="status" className="text-xs text-ink-500">
            {isFiltered(filter)
              ? `${shown.length} of ${plural(inspections.data.length)}`
              : plural(inspections.data.length)}
          </p>
          {shown.length > 0 ? (
            <InspectionList inspections={shown} models={settings.data?.machineModels} />
          ) : (
            <EmptyState
              icon={SearchX}
              title="No inspections match"
              hint="Try other words, or another model or state."
              action={
                <Button
                  variant="secondary"
                  onClick={() => setFilter({ query: '', model: '', state: '' })}
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

function plural(count: number): string {
  return `${count} ${count === 1 ? 'inspection' : 'inspections'}`;
}
