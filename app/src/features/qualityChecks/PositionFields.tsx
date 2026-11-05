import clsx from 'clsx';
import { Field, INPUT } from '../../components/Field';

type Props = {
  position: string;
  operation: string;
  onChange: (patch: { position?: string; operation?: string }) => void;
  /** Titles of the machine's other quality checks, to say when a position is already in use. */
  taken: readonly { position: string; title: string }[];
};

/** A new quality check's Position and Operation: its title, "QC4 · Pre start up". */
export function PositionFields({ position, operation, onChange, taken }: Props) {
  const same = taken.find(
    (other) =>
      position.trim() !== '' &&
      other.position.trim().toLowerCase() === position.trim().toLowerCase(),
  );
  return (
    <div className="grid gap-5 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
      <Field label="Position" hint={same ? `“${same.title}” has this position too.` : 'E.g. QC4'}>
        {(control) => (
          <input
            {...control}
            required
            maxLength={50}
            value={position}
            onChange={(event) => onChange({ position: event.target.value })}
            className={clsx(INPUT, 'h-9')}
          />
        )}
      </Field>
      <Field label="Operation" hint="E.g. Pre start up">
        {(control) => (
          <input
            {...control}
            maxLength={200}
            value={operation}
            onChange={(event) => onChange({ operation: event.target.value })}
            className={clsx(INPUT, 'h-9')}
          />
        )}
      </Field>
    </div>
  );
}
