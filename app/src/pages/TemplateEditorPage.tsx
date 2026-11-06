import { hasRole } from '@modig/shared';
import { FileClock } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { EmptyState } from '../components/EmptyState';
import { LoadError, PageLoading } from '../components/PageStates';
import { templatePrintHref } from '../features/print/links';
import { Badge } from '../features/templates/Badge';
import { MachineHeader } from '../features/templates/MachineHeader';
import { PublishedTemplateView } from '../features/templates/PublishedTemplateView';
import {
  qualityCheckHref,
  templateHref,
  useTemplateDetail,
  useTemplateRevision,
  useTemplates,
} from '../features/templates/queries';
import { TemplateEditor } from '../features/templates/TemplateEditor';
import { TemplateNotFound } from '../features/templates/TemplateNotFound';
import { errorMessage, isMissing } from '../lib/api';
import { useCurrentUser } from '../lib/useMe';

/**
 * /templates/:id — a machine's Final inspection tab: admins edit the draft; inspectors see the
 * latest published revision. A quality check's id leads to its own page.
 */
export function TemplateEditorPage() {
  const { id = '' } = useParams();
  const isAdmin = hasRole(useCurrentUser().roles, 'admin');
  return isAdmin ? <DraftEditor id={id} kind="final" /> : <LatestRevision id={id} />;
}

/**
 * The editor of a template's draft (admins), once loaded. `kind` is what the address is for: a
 * final inspection template at /templates/:id, a quality check under its machine (`parentId`).
 * Anything else is sent to its own address.
 */
export function DraftEditor({
  id,
  kind,
  parentId,
}: {
  id: string;
  kind: 'final' | 'quality';
  parentId?: string;
}) {
  const query = useTemplateDetail(id);
  // Bumped by Reload, so the editor starts over from the freshly loaded draft.
  const [opened, setOpened] = useState(0);

  // Once open, the editor stays even if a background refetch fails: it may hold unsaved work.
  if (query.data) {
    const { draft } = query.data.detail;
    if (draft.kind !== kind || (kind === 'quality' && draft.parentId !== parentId)) {
      return <Navigate to={templateHref(draft)} replace />;
    }
    return (
      <TemplateEditor
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
  const noun = kind === 'quality' ? 'quality check' : 'template';
  if (query.isPending) return <PageLoading label={`Loading the ${noun}…`} />;
  if (isMissing(query.error)) return <TemplateNotFound what={noun} />;
  return (
    <LoadError
      title={`We couldn't load the ${noun}`}
      message={errorMessage(query.error)}
      onRetry={() => void query.refetch()}
      retrying={query.isFetching}
    />
  );
}

/** Inspectors work from published revisions only; drafts are the admins' business. */
function LatestRevision({ id }: { id: string }) {
  const templates = useTemplates();
  const summary = templates.data?.find((template) => template.id === id);
  const latest = summary?.publishedRevision ?? null;
  const revision = useTemplateRevision(id, summary?.kind === 'final' ? latest : null);

  const failed = templates.isError ? templates : revision.isError ? revision : null;
  if (failed) {
    return (
      <LoadError
        title="We couldn't load the template"
        message={errorMessage(failed.error)}
        onRetry={() => void failed.refetch()}
        retrying={failed.isFetching}
      />
    );
  }
  if (templates.isPending) return <PageLoading label="Loading the template…" />;
  if (!summary) return <TemplateNotFound />;
  if (summary.kind === 'quality' && summary.parentId) {
    return <Navigate to={qualityCheckHref(summary.parentId, summary.id)} replace />;
  }
  const header = (
    <MachineHeader
      templateId={id}
      modelCode={summary.modelCode}
      coverImageId={summary.coverImageId}
      tab="final"
    />
  );
  if (latest === null) {
    return (
      <>
        {header}
        <h2 className="mt-6 mb-6 text-xl font-semibold tracking-tight text-ink-900">
          {summary.name || 'Untitled template'}
        </h2>
        <EmptyState
          icon={FileClock}
          title="Not published yet"
          hint="A Quality admin is still preparing this checklist. Inspections can use it once a revision is published."
        />
      </>
    );
  }
  if (!revision.data) return <PageLoading label="Loading the template…" />;
  return (
    <PublishedTemplateView
      template={revision.data}
      top={header}
      titleLevel={2}
      title={revision.data.name}
      description="The latest published revision: the checklist new inspections use."
      badges={<Badge tone="ok">Rev {latest}</Badge>}
      printHref={templatePrintHref(id)}
    />
  );
}
