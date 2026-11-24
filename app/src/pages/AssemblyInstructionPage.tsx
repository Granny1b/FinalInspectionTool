import { hasRole } from '@modig/shared';
import { FileClock, Pencil } from 'lucide-react';
import { Navigate, useParams } from 'react-router';
import { BackLink } from '../components/BackLink';
import { ButtonLink } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { LoadError, PageLoading } from '../components/PageStates';
import { Badge } from '../features/templates/Badge';
import { PublishedTemplateView } from '../features/templates/PublishedTemplateView';
import {
  assemblyEditHref,
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
 * /assembly/:id — an assembly instruction to read: its latest published revision, for everyone.
 * It is written under its model's machine template, where **Edit** takes an admin.
 */
export function AssemblyInstructionPage() {
  const { id = '' } = useParams();
  const isAdmin = hasRole(useCurrentUser().roles, 'admin');
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
  // Where it is written: under its model's machine template, once the model has one.
  const editHref = assemblyEditHref(templates.data ?? [], summary);
  const edit = isAdmin && (
    <ButtonLink to={editHref ?? '/templates'} variant="secondary" className="ml-2">
      <Pencil size={16} aria-hidden="true" />
      {editHref ? 'Edit' : 'Set up its machine template to edit'}
    </ButtonLink>
  );
  if (latest === null) {
    return (
      <>
        {back}
        <div className="mt-2">
          <PageHeader
            title={summary.name || 'Untitled assembly instruction'}
            description={model}
            actions={edit}
          />
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
      badges={
        <>
          <Badge tone="ok">Rev {latest}</Badge>
          {isAdmin && summary.hasUnpublishedChanges && (
            <Badge tone="brand">The draft has unpublished changes</Badge>
          )}
          {edit}
        </>
      }
    />
  );
}

/**
 * /templates/:id/assembly/:instructionId — an assembly instruction's editor, under its model's
 * machine template (admins). Everyone else is sent to where it is read.
 */
export function AssemblyEditorPage() {
  const { instructionId = '' } = useParams();
  const isAdmin = hasRole(useCurrentUser().roles, 'admin');
  if (!isAdmin) return <Navigate to={`/assembly/${instructionId}`} replace />;
  return <DraftEditor id={instructionId} kind="assembly" />;
}
