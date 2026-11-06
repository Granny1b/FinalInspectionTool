import { ShieldCheck } from 'lucide-react';
import { BackLink } from '../components/BackLink';
import { ButtonLink } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { LoadError, PageLoading } from '../components/PageStates';
import { inspectionsListHref } from '../features/inspections/listFilter';
import { StartQualityCheckForm } from '../features/inspections/quality/StartQualityCheckForm';
import { startChoices } from '../features/inspections/quality/startChoices';
import { useTemplates } from '../features/templates/queries';
import { errorMessage } from '../lib/api';
import { useSettings } from '../lib/useSettings';

/**
 * /quality-checks/new — start a quality check on a machine: the machine, which of its published
 * quality checks, then the serial number and date. (A quality check itself, the list of rows to
 * check, is set up under Templates.)
 */
export function StartQualityCheckPage() {
  const templates = useTemplates();
  const settings = useSettings();

  let body;
  if (templates.isPending || settings.isPending) {
    body = <PageLoading label="Loading the quality checks…" header={false} />;
  } else if (templates.isError) {
    body = (
      <LoadError
        title="We couldn't load the quality checks"
        message={errorMessage(templates.error)}
        onRetry={() => void templates.refetch()}
        retrying={templates.isFetching}
      />
    );
  } else if (startChoices(templates.data, settings.data?.machineModels).length === 0) {
    body = (
      <EmptyState
        icon={ShieldCheck}
        title="No published quality check yet"
        hint="A quality check starts from one a Quality admin has published on a machine’s Quality checks tab, under Templates."
        action={
          <ButtonLink to="/templates" variant="secondary">
            Go to templates
          </ButtonLink>
        }
      />
    );
  } else {
    body = (
      <StartQualityCheckForm templates={templates.data} models={settings.data?.machineModels} />
    );
  }

  return (
    <>
      <BackLink to={inspectionsListHref('quality')} label="Quality checks" />
      <div className="mt-2">
        <PageHeader
          title="Start a quality check"
          description="Pick the machine and its quality check, then fill in its Machine ID, serial number and date."
        />
      </div>
      {body}
    </>
  );
}
