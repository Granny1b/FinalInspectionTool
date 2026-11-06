import type { InspectionFrontInput, QualityFront } from '@modig/shared';
import clsx from 'clsx';
import { memo, type ReactNode } from 'react';
import { DateInput } from '../../../components/DateInput';
import { Field, INPUT } from '../../../components/Field';
import { FrontPageFrame } from '../../templates/FrontPage';
import { formatCalendarDate } from '../dates';
import { FRONT_FIELD_IDS } from '../issues';
import { ParticipantsField, type PendingParticipant } from '../ParticipantsField';

/** What a quality check's front page asks: which machine, when, and who checked it. */
export type QualityCheckFrontInput = Pick<
  InspectionFrontInput,
  'serialNumber' | 'participants' | 'date'
>;

/** The quality check it follows, as frozen in it (or as published, before it is started). */
export type QualityStandard = {
  /** "Quality check – Pre start up" */
  title: string;
  front: QualityFront | undefined;
  revision: number;
};

type FieldsProps = {
  front: QualityCheckFrontInput;
  /** "RigiMill MG": the machine is the quality check's model, never changed here. */
  modelLabel: string;
  errors: { serialNumber?: string };
  onChange: (patch: Partial<QualityCheckFrontInput>) => void;
  /** The check's page: a name typed under Checked by but not yet added counts as unsaved. */
  pendingParticipant?: PendingParticipant;
};

/**
 * A quality check's front page fields: Machine (its model, fixed), Serial number, Date and Checked
 * by. Nothing about delivery: no machine name, location or photo, as for a check along the build.
 * Used by the start form and by the check's front page.
 */
export function QualityCheckFrontFields({
  front,
  modelLabel,
  errors,
  onChange,
  pendingParticipant,
}: FieldsProps) {
  return (
    <>
      <div>
        <p className="text-sm font-medium text-ink-800">Machine</p>
        {/* As high as the inputs beside it, so the row lines up. */}
        <p className="mt-1.5 flex h-9 items-center text-sm text-ink-900">{modelLabel}</p>
      </div>
      <Field id={FRONT_FIELD_IDS.serialNumber} label="Serial number" error={errors.serialNumber}>
        {(control) => (
          <input
            {...control}
            maxLength={100}
            autoComplete="off"
            spellCheck={false}
            value={front.serialNumber}
            onChange={(event) => onChange({ serialNumber: event.target.value })}
            className={clsx(INPUT, 'h-9')}
          />
        )}
      </Field>
      <Field label="Date">
        {(control) => (
          <DateInput
            {...control}
            value={front.date}
            onChange={(date) => onChange({ date })}
            min="2000-01-01"
            max="2099-12-31"
          />
        )}
      </Field>
      <div className="col-span-full">
        <Field label="Checked by">
          {(control) => (
            <ParticipantsField
              control={control}
              value={front.participants}
              onChange={(participants) => onChange({ participants })}
              pending={pendingParticipant}
            />
          )}
        </Field>
      </div>
    </>
  );
}

/**
 * The quality check it follows, read-only, under the fields: its title, department and document
 * number (the revision is in the frame's corner).
 */
export function QualityStandardDetails({ standard }: { standard: QualityStandard }) {
  return (
    <div className="col-span-full border-t border-ink-200 pt-4">
      <dl className="grid grid-cols-1 gap-x-5 gap-y-4 text-sm @min-[28rem]:grid-cols-2 @min-[44rem]:grid-cols-3">
        <Detail label="Quality check">{standard.title}</Detail>
        <Detail label="Department">{standard.front?.department}</Detail>
        <Detail label="Document no.">{standard.front?.documentNumber}</Detail>
      </dl>
    </div>
  );
}

type CardProps = {
  front: InspectionFrontInput;
  modelLabel: string;
  standard: QualityStandard;
  /** Finalised: shown as text, nothing can be changed. */
  readOnly: boolean;
  errors: { serialNumber?: string };
  onChange: (patch: Partial<InspectionFrontInput>) => void;
  pendingParticipant: PendingParticipant;
};

/**
 * A quality check's front page on its page: the fields until it is finalised, then the same as
 * text, and the quality check it follows. Memoised: the page re-renders on every key pressed in
 * the checklist, the front page only when it changes.
 */
export const QualityCheckFrontCard = memo(function QualityCheckFrontCard({
  front,
  modelLabel,
  standard,
  readOnly,
  errors,
  onChange,
  pendingParticipant,
}: CardProps) {
  return (
    <FrontPageFrame revisionLabel={`Rev: ${standard.revision}`} layout="fields">
      {readOnly ? (
        <div className="col-span-full">
          <dl className="grid grid-cols-1 gap-x-5 gap-y-4 text-sm @min-[28rem]:grid-cols-2 @min-[44rem]:grid-cols-3">
            <Detail label="Machine">{modelLabel}</Detail>
            <Detail label="Serial number">{front.serialNumber}</Detail>
            <Detail label="Date">{formatCalendarDate(front.date)}</Detail>
            <Detail label="Checked by" wide>
              {front.participants.join(', ')}
            </Detail>
          </dl>
        </div>
      ) : (
        <QualityCheckFrontFields
          front={front}
          modelLabel={modelLabel}
          errors={errors}
          onChange={onChange}
          pendingParticipant={pendingParticipant}
        />
      )}
      <QualityStandardDetails standard={standard} />
    </FrontPageFrame>
  );
});

function Detail({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? 'col-span-full' : undefined}>
      <dt className="text-xs font-medium text-ink-500">{label}</dt>
      <dd className="mt-1 wrap-break-word text-ink-900">
        {children || <span className="text-ink-500">—</span>}
      </dd>
    </div>
  );
}
