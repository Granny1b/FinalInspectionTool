import type { InspectionFrontInput } from '@modig/shared';
import { memo, type ReactNode } from 'react';
import { FrontPageFrame } from '../templates/FrontPage';
import { formatCalendarDate } from './dates';
import { FrontPageFields } from './FrontPageFields';
import { MachinePhoto, MachinePhotoField } from './MachinePhoto';

type Props = {
  front: InspectionFrontInput;
  modelLabel: string;
  /** The template revision the inspection was created from ("Rev: 2" in the corner, as printed). */
  templateRevision: number;
  /** Finalised: shown as text, nothing can be changed. */
  readOnly: boolean;
  errors: { machineName?: string; serialNumber?: string };
  onChange: (patch: Partial<InspectionFrontInput>) => void;
  /** A photo upload has started; the promise settles once it is in the front page (or failed). */
  onUpload: (upload: Promise<void>) => void;
};

/**
 * The inspection's front page (brief §5.3: "editable until finalised"). Memoised: the page
 * re-renders on every key pressed in the checklist, the front page only when it changes.
 */
export const FrontPageCard = memo(function FrontPageCard({
  front,
  modelLabel,
  templateRevision,
  readOnly,
  errors,
  onChange,
  onUpload,
}: Props) {
  return (
    <FrontPageFrame revisionLabel={`Rev: ${templateRevision}`}>
      {readOnly ? (
        <>
          <MachinePhoto imageId={front.photoId} />
          <dl className="grid content-start gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
            <Detail label="Machine name" wide>
              {front.machineName}
            </Detail>
            <Detail label="Machine model">{modelLabel}</Detail>
            <Detail label="Serial number">{front.serialNumber}</Detail>
            <Detail label="Participants" wide>
              {front.participants.join(', ')}
            </Detail>
            <Detail label="Location">{front.location}</Detail>
            <Detail label="Date">{formatCalendarDate(front.date)}</Detail>
          </dl>
        </>
      ) : (
        <>
          <MachinePhotoField
            imageId={front.photoId}
            onChange={(photoId) => onChange({ photoId })}
            onUpload={onUpload}
          />
          <FrontPageFields
            front={front}
            modelLabel={modelLabel}
            errors={errors}
            onChange={onChange}
          />
        </>
      )}
    </FrontPageFrame>
  );
});

function Detail({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-xs font-medium text-ink-500">{label}</dt>
      <dd className="mt-1 wrap-break-word text-ink-900">
        {children || <span className="text-ink-500">—</span>}
      </dd>
    </div>
  );
}
