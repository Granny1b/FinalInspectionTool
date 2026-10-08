import { hasRole, type Template } from '@modig/shared';
import { FileClock } from 'lucide-react';
import { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { EmptyState } from '../components/EmptyState';
import { parseAppendix } from '../features/print/links';
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
 * /templates/:id/print[?revision=n][&appendix=1] — a template's checklist as it prints for a new
 * inspection, blank, with an empty front page. Admins see the draft (marked as such), inspectors
 * the latest published revision; `?revision=n` shows that revision to both. `appendix=1` adds
 * its reference images.
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
  const [params, setParams] = useSearchParams();
  const appendix = parseAppendix(params.get('appendix'));
  const model = useMemo(
    () =>
      settings.data
        ? templatePrint(template, {
            draft,
            companyName: settings.data.companyName,
            modelLabel: modelName(settings.data.machineModels, template.modelCode),
          })
        : null,
    [template, draft, settings.data],
  );
  const images = usePrintImages(model, settings.data?.logoImageId, { appendix });
  if (settings.isError) return <PrintLoadError query={settings} />;
  if (!model || images.loading) return <PrintLoading />;

  /** Changes the address in place, keeping `revision`. */
  const setAppendix = (value: boolean) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set('appendix', '1');
        else next.delete('appendix');
        return next;
      },
      { replace: true },
    );
  return (
    <PrintView
      model={model}
      images={images}
      subject={model.checklistTitle}
      back={back}
      appendix={{ value: appendix, onChange: setAppendix }}
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
