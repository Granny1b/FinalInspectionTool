import type { Template } from '@modig/shared';
import { Printer } from 'lucide-react';
import type { ReactNode } from 'react';
import { BackLink } from '../../components/BackLink';
import { ButtonLink } from '../../components/Button';
import { PageHeader } from '../../components/PageHeader';
import { useSettings } from '../../lib/useSettings';
import { ChecklistHeading } from './ChecklistHeading';
import { TemplateDocument } from './document/TemplateDocument';
import { PublishedFrontPage } from './FrontPage';

type Props = {
  template: Template;
  back: { to: string; label: string };
  title: string;
  description: string;
  /** Badges next to the description, e.g. "Latest". */
  badges?: ReactNode;
  /** This revision's print preview. */
  printHref: string;
};

/** A published revision, read-only: its front page and its checklist. */
export function PublishedTemplateView({
  template,
  back,
  title,
  description,
  badges,
  printHref,
}: Props) {
  const settings = useSettings();
  return (
    <>
      <BackLink {...back} />
      <div className="mt-2">
        <PageHeader
          title={title}
          description={description}
          actions={
            <>
              {badges}
              <ButtonLink variant="secondary" to={printHref} className="ml-2">
                <Printer size={16} aria-hidden="true" />
                Print preview
              </ButtonLink>
            </>
          }
        />
      </div>
      <PublishedFrontPage template={template} models={settings.data?.machineModels} />
      <section aria-labelledby="checklist-title" className="mt-10">
        <ChecklistHeading id="checklist-title" sections={template.sections} />
        <TemplateDocument
          sections={template.sections}
          spareRowsPerSection={template.printSettings.spareRowsPerSection}
        />
      </section>
    </>
  );
}
