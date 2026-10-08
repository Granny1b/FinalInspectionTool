import { hasRole } from '@modig/shared';
import { FileClock } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router';
import { BackLink } from '../components/BackLink';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { LoadError, PageLoading } from '../components/PageStates';
import { templatePrintHref } from '../features/print/links';
import { Badge } from '../features/templates/Badge';
import { PublishedTemplateView } from '../features/templates/PublishedTemplateView';
import {
  useTemplateDetail,
  useTemplateRevision,
  useTemplates,
} from '../features/templates/queries';
import { TemplateEditor } from '../features/templates/TemplateEditor';
import { TemplateNotFound } from '../features/templates/TemplateNotFound';
import { errorMessage, isMissing } from '../lib/api';
import { useCurrentUser } from '../lib/useMe';

/** /templates/:id — admins edit the draft; inspectors see the latest published revision. */
export function TemplateEditorPage() {
  const { id = '' } = useParams();
  const isAdmin = hasRole(useCurrentUser().roles, 'admin');
  return isAdmin ? <DraftEditor id={id} /> : <LatestRevision id={id} />;
}

function DraftEditor({ id }: { id: string }) {
  const query = useTemplateDetail(id);
  // Bumped by Reload, so the editor starts over from the freshly loaded draft.
  const [opened, setOpened] = useState(0);

  // Once open, the editor stays even if a background refetch fails: it may hold unsaved work.
  if (query.data) {
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
  if (query.isPending) return <PageLoading label="Loading the template…" />;
  if (isMissing(query.error)) return <TemplateNotFound />;
  return (
    <LoadError
      title="We couldn't load the template"
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
  const revision = useTemplateRevision(id, latest);

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
  if (latest === null) {
    return (
      <>
        <BackLink to="/templates" label="Templates" />
        <div className="mt-2">
          <PageHeader title={summary.name || 'Untitled template'} />
        </div>
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
      back={{ to: '/templates', label: 'Templates' }}
      title={revision.data.name}
      description="The latest published revision: the checklist new inspections use."
      badges={<Badge tone="ok">Rev {latest}</Badge>}
      printHref={templatePrintHref(id)}
    />
  );
}
