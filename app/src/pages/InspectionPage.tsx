import { useState } from 'react';
import { useParams } from 'react-router';
import { LoadError, PageLoading } from '../components/PageStates';
import { InspectionEditor } from '../features/inspections/InspectionEditor';
import { InspectionNotFound } from '../features/inspections/InspectionNotFound';
import { useInspection } from '../features/inspections/queries';
import { errorMessage, isMissing } from '../lib/api';

/** /inspections/:id — fill in, finalise and (admins) reopen one inspection. */
export function InspectionPage() {
  const { id = '' } = useParams();
  const query = useInspection(id);
  // Bumped by Reload, so the page starts over from the freshly loaded inspection.
  const [opened, setOpened] = useState(0);

  // Once open, the page stays even if a background refetch fails: it may hold unsaved work.
  if (query.data) {
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
  if (query.isPending) return <PageLoading label="Loading the inspection…" />;
  if (isMissing(query.error)) return <InspectionNotFound />;
  return (
    <LoadError
      title="We couldn't load the inspection"
      message={errorMessage(query.error)}
      onRetry={() => void query.refetch()}
      retrying={query.isFetching}
    />
  );
}
