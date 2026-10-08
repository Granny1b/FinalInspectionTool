import { hasRole, type Template } from '@modig/shared';
import { FileClock } from 'lucide-react';
import { useParams, useSearchParams } from 'react-router';
import { EmptyState } from '../components/EmptyState';
import { templatePrint } from '../features/print/model';
import { PrintLoadError, PrintLoading, PrintMessage } from '../features/print/PrintStates';
import { PrintView } from '../features/print/PrintView';
import { usePrintImages } from '../features/print/usePrintImages';
import {
  parseRevision,
  useTemplateDetail,
  useTemplateRevision,
  useTemplates,
} from '../features/templates/queries';
import { TemplateNotFound } from '../features/templates/TemplateNotFound';
import { isMissing } from '../lib/api';
import { useCurrentUser } from '../lib/useMe';
import { modelName, useSettings } from '../lib/useSettings';

type Back = { to: string; label: string };

/**
 * /templates/:id/print[?revision=n] — a template's checklist as it prints for a new inspection,
 * blank, with an empty front page. Admins see the draft (marked as such), inspectors the latest
 * published revision; `?revision=n` shows that revision to both.
 */
export function TemplatePrintPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const isAdmin = hasRole(useCurrentUser().roles, 'admin');
  const revisionParam = params.get('revision');

  if (revisionParam !== null) return <RevisionPrint id={id} param={revisionParam} />;
  return isAdmin ? <DraftPrint id={id} /> : <LatestPrint id={id} />;
}

function DraftPrint({ id }: { id: string }) {
  const query = useTemplateDetail(id);
  if (isMissing(query.error)) return <NotFound />;
  if (query.isError) return <PrintLoadError query={query} />;
  if (!query.data) return <PrintLoading />;
  return (
    <TemplatePrint
      template={query.data.detail.draft}
      draft
      back={{ to: `/templates/${id}`, label: 'Back to the editor' }}
    />
  );
}

/** Inspectors work from published revisions only, as on the template page. */
function LatestPrint({ id }: { id: string }) {
  const templates = useTemplates();
  const summary = templates.data?.find((template) => template.id === id);
  const latest = summary?.publishedRevision ?? null;
  const revision = useTemplateRevision(id, latest);

  const failed = templates.isError ? templates : revision.isError ? revision : null;
  if (failed) return <PrintLoadError query={failed} />;
  if (templates.isPending) return <PrintLoading />;
  if (!summary) return <NotFound />;
  if (latest === null) {
    return (
      <PrintMessage>
        <EmptyState
          icon={FileClock}
          title="Not published yet"
          hint="There is nothing to print until a Quality admin publishes a revision of this checklist."
        />
      </PrintMessage>
    );
  }
  if (!revision.data) return <PrintLoading />;
  return (
    <TemplatePrint
      template={revision.data}
      draft={false}
      back={{ to: `/templates/${id}`, label: 'Back to the template' }}
    />
  );
}

function RevisionPrint({ id, param }: { id: string; param: string }) {
  const number = parseRevision(param);
  const revision = useTemplateRevision(id, number);
  if (number === null || isMissing(revision.error)) return <NotFound what="revision" />;
  if (revision.isError) return <PrintLoadError query={revision} />;
  if (!revision.data) return <PrintLoading />;
  return (
    <TemplatePrint
      template={revision.data}
      draft={false}
      back={{ to: `/templates/${id}/revisions/${number}`, label: `Back to revision ${number}` }}
    />
  );
}

function TemplatePrint({
  template,
  draft,
  back,
}: {
  template: Template;
  draft: boolean;
  back: Back;
}) {
  const settings = useSettings();
  const images = usePrintImages(template.coverImageId, settings.data?.logoImageId);
  if (settings.isError) return <PrintLoadError query={settings} />;
  if (!settings.data || images.loading) return <PrintLoading />;

  const model = templatePrint(template, {
    draft,
    companyName: settings.data.companyName,
    modelLabel: modelName(settings.data.machineModels, template.modelCode),
  });
  return (
    <PrintView
      model={model}
      logoUrl={images.logoUrl}
      photoUrl={images.photoUrl}
      subject={model.checklistTitle}
      back={back}
    />
  );
}

function NotFound({ what }: { what?: 'revision' }) {
  return (
    <PrintMessage>
      <TemplateNotFound what={what} />
    </PrintMessage>
  );
}
