import { DEFAULT_LOCATION } from '@modig/shared';
import { FileClock } from 'lucide-react';
import { BackLink } from '../components/BackLink';
import { ButtonLink } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { LoadError, PageLoading } from '../components/PageStates';
import { inspectionsListHref } from '../features/inspections/listFilter';
import { NewInspectionForm } from '../features/inspections/NewInspectionForm';
import { useTemplates } from '../features/templates/queries';
import { errorMessage } from '../lib/api';
import { useSettings } from '../lib/useSettings';

/**
 * /inspections/new — pick a published checklist and fill in the front page (brief §5.1). Final
 * inspections only: a quality check is started from /quality-checks/new.
 */
export function InspectionNewPage() {
  const templates = useTemplates();
  const settings = useSettings();

  let body;
  if (templates.isPending || settings.isPending) {
    body = <PageLoading label="Loading the checklists…" header={false} />;
  } else if (templates.isError) {
    body = (
      <LoadError
        title="We couldn't load the checklists"
        message={errorMessage(templates.error)}
        onRetry={() => void templates.refetch()}
        retrying={templates.isFetching}
      />
    );
  } else {
    // Inspections start from the latest published revision; drafts can't be used.
    // Quality checks are never inspected this way: only the machines' final inspection templates.
    const published = templates.data.filter(
      (template) => template.kind === 'final' && template.publishedRevision !== null,
    );
    body =
      published.length === 0 ? (
        <EmptyState
          icon={FileClock}
          title="No published checklist yet"
          hint="An inspection starts from a machine model’s published checklist. A Quality admin publishes them under Templates."
          action={
            <ButtonLink to="/templates" variant="secondary">
              Go to templates
            </ButtonLink>
          }
        />
      ) : (
        <NewInspectionForm
          templates={published}
          models={settings.data?.machineModels}
          // Without the settings the brief's default still applies.
          defaultLocation={settings.data ? settings.data.defaultLocation : DEFAULT_LOCATION}
        />
      );
  }

  return (
    <>
      <BackLink to={inspectionsListHref()} label="Inspections" />
      <div className="mt-2">
        <PageHeader
          title="New final inspection"
          description="Pick the machine model’s final inspection checklist and fill in the front page."
        />
      </div>
      {body}
    </>
  );
}
