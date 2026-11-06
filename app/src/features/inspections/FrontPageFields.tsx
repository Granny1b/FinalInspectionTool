import type { InspectionFrontInput } from '@modig/shared';
import clsx from 'clsx';
import { DateInput } from '../../components/DateInput';
import { Field, INPUT } from '../../components/Field';
import { FRONT_FIELD_IDS } from './issues';
import { ParticipantsField, type PendingParticipant } from './ParticipantsField';

type Props = {
  front: InspectionFrontInput;
  /** "RigiMill MG": the model comes from the template and can't be changed here. */
  modelLabel: string;
  errors: { machineName?: string; serialNumber?: string };
  onChange: (patch: Partial<InspectionFrontInput>) => void;
  /** The inspection page: a participant typed but not yet added counts as unsaved. */
  pendingParticipant?: PendingParticipant;
};

/**
 * The front page's details (brief §2 `Main`): Machine ID, model, serial number, participants,
 * location and date. Used by the new-inspection form and the inspection's front page card.
 */
export function FrontPageFields({
  front,
  modelLabel,
  errors,
  onChange,
  pendingParticipant,
}: Props) {
  return (
    <div className="grid content-start gap-x-4 gap-y-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <MachineIdField
          value={front.machineName}
          error={errors.machineName}
          onChange={(machineName) => onChange({ machineName })}
        />
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
              pending={pendingParticipant}
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

/** What the hint under the Machine ID says, here and on a quality check. */
export const MACHINE_ID_HINT = 'As in Monitor, e.g. Magellan#1';

type MachineIdProps = { value: string; error?: string; onChange: (machineId: string) => void };

/**
 * The Machine ID: the machine as the ERP (Monitor) knows it, on a final inspection and a quality
 * check alike. Stored as the front page's `machineName`.
 */
export function MachineIdField({ value, error, onChange }: MachineIdProps) {
  return (
    <Field id={FRONT_FIELD_IDS.machineName} label="Machine ID" hint={MACHINE_ID_HINT} error={error}>
      {(control) => (
        <input
          {...control}
          maxLength={200}
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={clsx(INPUT, 'h-9')}
        />
      )}
    </Field>
  );
}

/**
 * "2026-11-05", typed or picked. Only complete dates are passed on (the API refuses anything
 * else), and leaving a half-typed or emptied field shows the last date again.
 */
function DateField({ value, onChange }: { value: string; onChange: (date: string) => void }) {
  return (
    <Field label="Date">
      {(control) => (
        <DateInput
          {...control}
          value={value}
          onChange={onChange}
          min="2000-01-01"
          max="2099-12-31"
        />
      )}
    </Field>
  );
}
