import { hasRole } from '@modig/shared';
import { Navigate, useParams } from 'react-router';
import { BackLink } from '../components/BackLink';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { LoadError, PageLoading } from '../components/PageStates';
import { templatePrintHref } from '../features/print/links';
import { Badge } from '../features/templates/Badge';
import { PublishedTemplateView } from '../features/templates/PublishedTemplateView';
import {
  parseRevision,
  qualityCheckHref,
  qualityChecksHref,
  useTemplateRevision,
  useTemplates,
} from '../features/templates/queries';
import { TemplateNotFound } from '../features/templates/TemplateNotFound';
import { errorMessage, isMissing } from '../lib/api';
import { useCurrentUser } from '../lib/useMe';
import { modelName, useSettings } from '../lib/useSettings';

/**
 * /templates/:id/revisions/:revision, and a quality check's at
 * /templates/:id/quality-checks/:qcId/revisions/:revision — one published revision, read-only
 * (from the revision history).
 */
export function TemplateRevisionPage() {
  const { id = '', qcId, revision: param = '' } = useParams();
  const templateId = qcId ?? id;
  const isAdmin = hasRole(useCurrentUser().roles, 'admin');
  const number = parseRevision(param);
  const revision = useTemplateRevision(templateId, number);
  const templates = useTemplates();
  const settings = useSettings();
  // Only to say whether this is the latest revision; the page works without it.
  const summary = templates.data?.find((template) => template.id === templateId);
  const latest = summary?.publishedRevision;

  if (number === null) return <TemplateNotFound what="revision" />;
  if (revision.isPending) return <PageLoading label="Loading the revision…" />;
  if (revision.isError) {
    return isMissing(revision.error) ? (
      <TemplateNotFound what="revision" />
    ) : (
      <LoadError
        title="We couldn't load this revision"
        message={errorMessage(revision.error)}
        onRetry={() => void revision.refetch()}
        retrying={revision.isFetching}
      />
    );
  }

  const { kind, parentId } = revision.data;
  // Each kind at its own address.
  if (kind === 'quality' && parentId && (!qcId || parentId !== id)) {
    return (
      <Navigate to={`${qualityCheckHref(parentId, templateId)}/revisions/${number}`} replace />
    );
  }
  if (kind === 'final' && qcId) {
    return <Navigate to={`/templates/${qcId}/revisions/${number}`} replace />;
  }

  const badges = (
    <>
      <Badge tone={latest === number ? 'ok' : 'neutral'}>Rev {number}</Badge>
      {latest === number && <Badge tone="ok">Latest</Badge>}
      {latest !== undefined && latest !== null && latest > number && (
        <Badge>Rev {latest} is the latest</Badge>
      )}
    </>
  );
  const description = `Revision ${number}, read-only: a published revision never changes.`;

  if (kind === 'quality' && parentId) {
    const machine = templates.data?.find((template) => template.id === parentId);
    const machineName = modelName(
      settings.data?.machineModels,
      machine?.modelCode ?? revision.data.modelCode,
    );
    return (
      <PublishedTemplateView
        template={revision.data}
        top={
          <Breadcrumbs
            items={[
              { to: '/templates', label: 'Templates' },
              { to: `/templates/${parentId}`, label: machineName },
              { to: qualityChecksHref(parentId), label: 'Quality checks' },
              {
                to: qualityCheckHref(parentId, templateId),
                label: summary?.name || revision.data.name || 'Untitled quality check',
              },
            ]}
          />
        }
        title={revision.data.name || 'Untitled quality check'}
        description={description}
        badges={badges}
        printHref={templatePrintHref(templateId, number)}
      />
    );
  }
  return (
    <PublishedTemplateView
      template={revision.data}
      top={
        <BackLink
          to={`/templates/${id}`}
          label={isAdmin ? 'Back to the editor' : 'Back to the template'}
        />
      }
      title={revision.data.name}
      description={description}
      badges={badges}
      printHref={templatePrintHref(id, number)}
    />
  );
}
