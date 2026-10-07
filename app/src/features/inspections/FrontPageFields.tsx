import type { InspectionFrontInput } from '@modig/shared';
import clsx from 'clsx';
import { useState } from 'react';
import { Field, INPUT } from '../../components/Field';
import { FRONT_FIELD_IDS } from './issues';
import { ParticipantsField } from './ParticipantsField';

type Props = {
  front: InspectionFrontInput;
  /** "RigiMill MG": the model comes from the template and can't be changed here. */
  modelLabel: string;
  errors: { machineName?: string; serialNumber?: string };
  onChange: (patch: Partial<InspectionFrontInput>) => void;
};

/**
 * The front page's details (brief §2 `Main`): machine name, model, serial number, participants,
 * location and date. Used by the new-inspection form and the inspection's front page card.
 */
export function FrontPageFields({ front, modelLabel, errors, onChange }: Props) {
  return (
    <div className="grid content-start gap-x-4 gap-y-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field id={FRONT_FIELD_IDS.machineName} label="Machine name" error={errors.machineName}>
          {(control) => (
            <input
              {...control}
              maxLength={200}
              autoComplete="off"
              value={front.machineName}
              onChange={(event) => onChange({ machineName: event.target.value })}
              className={clsx(INPUT, 'h-9')}
            />
          )}
        </Field>
      </div>
      <div>
        <p className="text-sm font-medium text-ink-800">Machine model</p>
        {/* Same height as the inputs beside it, so the grid lines up. */}
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
      <div className="sm:col-span-2">
        <Field label="Participants">
          {(control) => (
            <ParticipantsField
              control={control}
              value={front.participants}
              onChange={(participants) => onChange({ participants })}
            />
          )}
        </Field>
      </div>
      <Field label="Location">
        {(control) => (
          <input
            {...control}
            maxLength={200}
            value={front.location}
            onChange={(event) => onChange({ location: event.target.value })}
            className={clsx(INPUT, 'h-9')}
          />
        )}
      </Field>
      <DateField value={front.date} onChange={(date) => onChange({ date })} />
    </div>
  );
}

/**
 * The date picker reports '' while a date is half typed or cleared, which the API would refuse;
 * only complete dates are passed on, and leaving the field shows the last one again.
 */
function DateField({ value, onChange }: { value: string; onChange: (date: string) => void }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <Field label="Date">
      {(control) => (
        <input
          {...control}
          type="date"
          value={text ?? value}
          onChange={(event) => {
            setText(event.target.value);
            if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) onChange(event.target.value);
          }}
          onBlur={() => setText(null)}
          className={clsx(INPUT, 'h-9 tabular-nums')}
        />
      )}
    </Field>
  );
}
