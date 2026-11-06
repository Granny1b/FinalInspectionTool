import { APP_NAME, type Template } from '@modig/shared';
import { Printer } from 'lucide-react';
import type { ReactNode } from 'react';
import { ButtonLink } from '../../components/Button';
import { PageHeader } from '../../components/PageHeader';
import { useSettings } from '../../lib/useSettings';
import { PublishedQualityFront } from '../qualityChecks/QualityFrontCard';
import { ChecklistHeading } from './ChecklistHeading';
import { TemplateDocument } from './document/TemplateDocument';
import { PublishedFrontPage } from './FrontPage';

type Props = {
  template: Template;
  /** Above the title: a back link, breadcrumbs or the machine's header with its tabs. */
  top: ReactNode;
  title: string;
  description: string;
  /** Badges next to the description, e.g. "Latest". */
  badges?: ReactNode;
  /** This revision's print preview (a quality check's instructions). */
  printHref?: string;
  /** 2 under a machine's heading (its Final inspection tab); the page's heading otherwise. */
  titleLevel?: 1 | 2;
};

/**
 * A published revision, read-only: its front page and its checklist. A quality check's shows its
 * own front page and its rows as cards.
 */
export function PublishedTemplateView({
  template,
  top,
  title,
  description,
  badges,
  printHref,
  titleLevel = 1,
}: Props) {
  const settings = useSettings();
  const quality = template.kind === 'quality';
  const actions = (
    <>
      {badges}
      {printHref && (
        <ButtonLink variant="secondary" to={printHref} className="ml-2">
          <Printer size={16} aria-hidden="true" />
          {quality ? 'Print instructions' : 'Print preview'}
        </ButtonLink>
      )}
    </>
  );
  return (
    <>
      {top}
      {titleLevel === 1 ? (
        <div className="mt-2">
          <PageHeader title={title} description={description} actions={actions} />
        </div>
      ) : (
        // Laid out as PageHeader, a level down.
        <div className="mt-6 mb-8 flex flex-wrap items-end justify-between gap-4">
          <title>{`${title} · ${APP_NAME}`}</title>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight text-ink-900">{title}</h2>
            <p className="mt-1.5 text-sm text-ink-500">{description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </div>
      )}
      {quality ? (
        <PublishedQualityFront template={template} />
      ) : (
        <PublishedFrontPage template={template} models={settings.data?.machineModels} />
      )}
      <section aria-labelledby="checklist-title" className="mt-10">
        <ChecklistHeading id="checklist-title" sections={template.sections} withTime={quality} />
        <TemplateDocument sections={template.sections} variant={template.kind} />
      </section>
    </>
  );
}
