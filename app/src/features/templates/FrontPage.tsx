import type { MachineModel, Template } from '@modig/shared';
import { useId, type ReactNode } from 'react';
import { Logo } from '../../components/Logo';
import { PhotoFrame } from '../../components/PhotoField';
import { formatDateTime } from '../../lib/format';
import { modelName } from '../../lib/useSettings';

type FrameProps = {
  /** Bottom right, like "Rev: 2" on the workbook's front page. */
  revisionLabel: string;
  children: ReactNode;
};

/**
 * Card shaped like the printed checklist's front page (brief §6): logo and title on top, the
 * machine photo with the details beside it, the revision in the bottom-right corner.
 */
export function FrontPageFrame({ revisionLabel, children }: FrameProps) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="rounded-lg border border-ink-200 bg-surface">
      <div className="flex items-center justify-between gap-4 border-b border-ink-100 px-5 py-3.5">
        <h2 id={titleId} className="text-sm font-semibold text-ink-900">
          Front page
        </h2>
        <Logo className="h-6" />
      </div>
      <div className="grid gap-x-6 gap-y-5 p-5 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        {children}
      </div>
      <p className="border-t border-ink-100 px-5 py-2.5 text-right text-xs text-ink-500 tabular-nums">
        {revisionLabel}
      </p>
    </section>
  );
}

/** The front page of a published revision, read-only. */
export function PublishedFrontPage({
  template,
  models,
}: {
  template: Template;
  models: MachineModel[] | undefined;
}) {
  return (
    <FrontPageFrame revisionLabel={`Rev: ${template.revision}`}>
      <PhotoFrame imageId={template.coverImageId} noun="cover photo" />
      <dl className="grid content-start gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
        <Detail label="Template name" wide>
          {template.name}
        </Detail>
        <Detail label="Machine model">{modelName(models, template.modelCode)}</Detail>
        <Detail label="Spare rows per section">{template.printSettings.spareRowsPerSection}</Detail>
        <Detail label="Published">
          {formatDateTime(template.updatedAt)}
          <span className="block truncate text-ink-500" title={template.updatedBy}>
            {template.updatedBy}
          </span>
        </Detail>
        {template.changeNote && (
          <Detail label="Change note" wide>
            <span className="whitespace-pre-line">{template.changeNote}</span>
          </Detail>
        )}
      </dl>
    </FrontPageFrame>
  );
}

function Detail({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-xs font-medium text-ink-500">{label}</dt>
      <dd className="mt-1 text-ink-900">{children}</dd>
    </div>
  );
}
