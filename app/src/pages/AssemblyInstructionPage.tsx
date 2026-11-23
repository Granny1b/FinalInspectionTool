import { hasRole } from '@modig/shared';
import { FileClock } from 'lucide-react';
import { Navigate, useParams } from 'react-router';
import { BackLink } from '../components/BackLink';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { LoadError, PageLoading } from '../components/PageStates';
import { Badge } from '../features/templates/Badge';
import { PublishedTemplateView } from '../features/templates/PublishedTemplateView';
import { templateHref, useTemplateRevision, useTemplates } from '../features/templates/queries';
import { TemplateNotFound } from '../features/templates/TemplateNotFound';
import { errorMessage } from '../lib/api';
import { useCurrentUser } from '../lib/useMe';
import { modelName, useSettings } from '../lib/useSettings';
import { DraftEditor } from './TemplateEditorPage';

/**
 * /assembly/:id — an assembly instruction: admins edit its draft; everyone else reads the latest
 * published revision.
 */
export function AssemblyInstructionPage() {
  const { id = '' } = useParams();
  const isAdmin = hasRole(useCurrentUser().roles, 'admin');
  return isAdmin ? <DraftEditor id={id} kind="assembly" /> : <LatestRevision id={id} />;
}

function LatestRevision({ id }: { id: string }) {
  const templates = useTemplates();
  const settings = useSettings();
  const summary = templates.data?.find((template) => template.id === id);
  const latest = summary?.publishedRevision ?? null;
  const revision = useTemplateRevision(id, summary?.kind === 'assembly' ? latest : null);

  const failed = templates.isError ? templates : revision.isError ? revision : null;
  if (failed) {
    return (
      <LoadError
        title="We couldn't load the assembly instruction"
        message={errorMessage(failed.error)}
        onRetry={() => void failed.refetch()}
        retrying={failed.isFetching}
      />
    );
  }
  if (templates.isPending) return <PageLoading label="Loading the assembly instruction…" />;
  if (!summary) return <TemplateNotFound what="assembly instruction" />;
  // A final inspection template's or a quality check's id: its own page.
  if (summary.kind !== 'assembly') return <Navigate to={templateHref(summary)} replace />;
  const back = <BackLink to="/assembly" label="Assembly instructions" />;
  const model = modelName(settings.data?.machineModels, summary.modelCode);
  if (latest === null) {
    return (
      <>
        {back}
        <div className="mt-2">
          <PageHeader title={summary.name || 'Untitled assembly instruction'} description={model} />
        </div>
        <EmptyState
          icon={FileClock}
          title="Not published yet"
          hint="This assembly instruction is still being written. It can be read here once a revision is published."
        />
      </>
    );
  }
  if (!revision.data) return <PageLoading label="Loading the assembly instruction…" />;
  return (
    <PublishedTemplateView
      template={revision.data}
      top={back}
      title={revision.data.name || 'Untitled assembly instruction'}
      description={`${model} · the latest published revision.`}
      badges={<Badge tone="ok">Rev {latest}</Badge>}
    />
  );
}
