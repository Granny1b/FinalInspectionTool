import type { Template } from '@modig/shared';
import type { ReactNode } from 'react';
import { BackLink } from '../../components/BackLink';
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
};

/** A published revision, read-only: its front page and its checklist. */
export function PublishedTemplateView({ template, back, title, description, badges }: Props) {
  const settings = useSettings();
  return (
    <>
      <BackLink {...back} />
      <div className="mt-2">
        <PageHeader title={title} description={description} actions={badges} />
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
