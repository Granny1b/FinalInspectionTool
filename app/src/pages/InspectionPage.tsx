import type { InspectionKind } from '@modig/shared';
import { useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { LoadError, PageLoading } from '../components/PageStates';
import { InspectionEditor } from '../features/inspections/InspectionEditor';
import { InspectionNotFound } from '../features/inspections/InspectionNotFound';
import { inspectionHref } from '../features/inspections/listFilter';
import { useInspection } from '../features/inspections/queries';
import { errorMessage, isMissing } from '../lib/api';

/**
 * /inspections/:id — fill in, finalise and (admins) reopen one inspection; /quality-checks/:id
 * the same for a quality check done on a machine. Each is sent to its own address when opened at
 * the other's.
 */
export function InspectionPage({ kind }: { kind: InspectionKind }) {
  const { id = '' } = useParams();
  const query = useInspection(id);
  // Bumped by Reload, so the page starts over from the freshly loaded inspection.
  const [opened, setOpened] = useState(0);

  // Once open, the page stays even if a background refetch fails: it may hold unsaved work.
  if (query.data) {
    const actual = query.data.inspection.kind;
    if (actual !== kind) return <Navigate to={inspectionHref(actual, id)} replace />;
    return (
      <InspectionEditor
        key={`${id}:${opened}`}
        loaded={query.data}
        onReload={async () => {
          const result = await query.refetch();
          if (result.isError) return false;
          setOpened((count) => count + 1);
          return true;
        }}
      />
    );
  }
  const noun = kind === 'quality' ? 'quality check' : 'inspection';
  if (query.isPending) return <PageLoading label={`Loading the ${noun}…`} />;
  if (isMissing(query.error)) return <InspectionNotFound kind={kind} />;
  return (
    <LoadError
      title={`We couldn't load the ${noun}`}
      message={errorMessage(query.error)}
      onRetry={() => void query.refetch()}
      retrying={query.isFetching}
    />
  );
}
