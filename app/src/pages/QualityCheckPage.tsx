import { hasRole } from '@modig/shared';
import { FileClock } from 'lucide-react';
import { Navigate, useParams } from 'react-router';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { LoadError, PageLoading } from '../components/PageStates';
import { Badge } from '../features/templates/Badge';
import { PublishedTemplateView } from '../features/templates/PublishedTemplateView';
import {
  qualityChecksHref,
  templateHref,
  useTemplateRevision,
  useTemplates,
} from '../features/templates/queries';
import { TemplateNotFound } from '../features/templates/TemplateNotFound';
import { errorMessage } from '../lib/api';
import { useCurrentUser } from '../lib/useMe';
import { modelName, useSettings } from '../lib/useSettings';
import { DraftEditor } from './TemplateEditorPage';

/**
 * /templates/:id/quality-checks/:qcId — a quality check of the machine whose final inspection
 * template is :id. Admins edit its draft; inspectors see its latest published revision.
 */
export function QualityCheckPage() {
  const { id = '', qcId = '' } = useParams();
  const isAdmin = hasRole(useCurrentUser().roles, 'admin');
  return isAdmin ? (
    <DraftEditor id={qcId} kind="quality" parentId={id} />
  ) : (
    <LatestQualityCheck parentId={id} id={qcId} />
  );
}

/** Inspectors work from published revisions only, as for final inspection templates. */
function LatestQualityCheck({ parentId, id }: { parentId: string; id: string }) {
  const templates = useTemplates();
  const settings = useSettings();
  const summary = templates.data?.find((template) => template.id === id);
  const latest = summary?.kind === 'quality' ? summary.publishedRevision : null;
  const revision = useTemplateRevision(id, latest);

  const failed = templates.isError ? templates : revision.isError ? revision : null;
  if (failed) {
    return (
      <LoadError
        title="We couldn't load the quality check"
        message={errorMessage(failed.error)}
        onRetry={() => void failed.refetch()}
        retrying={failed.isFetching}
      />
    );
  }
  if (templates.isPending) return <PageLoading label="Loading the quality check…" />;
  if (!summary) return <TemplateNotFound what="quality check" />;
  if (summary.kind !== 'quality' || summary.parentId !== parentId) {
    return <Navigate to={templateHref(summary)} replace />;
  }
  const machine = templates.data?.find((template) => template.id === parentId);
  const breadcrumbs = (
    <Breadcrumbs
      items={[
        { to: '/templates', label: 'Templates' },
        {
          to: `/templates/${parentId}`,
          label: modelName(settings.data?.machineModels, machine?.modelCode ?? summary.modelCode),
        },
        { to: qualityChecksHref(parentId), label: 'Quality checks' },
      ]}
    />
  );
  const title = summary.name || 'Untitled quality check';
  if (latest === null) {
    return (
      <>
        {breadcrumbs}
        <div className="mt-2">
          <PageHeader title={title} />
        </div>
        <EmptyState
          icon={FileClock}
          title="Not published yet"
          hint="A Quality admin is still preparing this quality check. It is shown here once a revision is published."
        />
      </>
    );
  }
  if (!revision.data) return <PageLoading label="Loading the quality check…" />;
  return (
    <PublishedTemplateView
      template={revision.data}
      top={breadcrumbs}
      title={revision.data.name || title}
      description="The latest published revision."
      badges={<Badge tone="ok">Rev {latest}</Badge>}
    />
  );
}
