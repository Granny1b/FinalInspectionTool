import { qualityCheckTitle } from '@modig/shared';
import clsx from 'clsx';
import { Field, INPUT } from '../../components/Field';

type Props = {
  name: string;
  onChange: (name: string) => void;
  /** The machine's other quality checks, to say when the name is already in use. */
  taken: readonly { name: string }[];
};

/**
 * A new quality check's name: the in-process check, "Pre start up". The check is called after it,
 * "Quality check – Pre start up", which the hint shows while the name is typed.
 */
export function NameField({ name, onChange, taken }: Props) {
  const typed = name.trim().toLowerCase();
  const same = typed !== '' && taken.some((other) => other.name.trim().toLowerCase() === typed);
  const title = qualityCheckTitle({ name });
  return (
    <Field
      label="Name"
      hint={
        same
          ? 'This machine already has a quality check with this name.'
          : title
            ? `It is called “${title}”.`
            : 'The in-process check, e.g. Pre start up.'
      }
    >
      {(control) => (
        <input
          {...control}
          required
          maxLength={200}
          value={name}
          onChange={(event) => onChange(event.target.value)}
          className={clsx(INPUT, 'h-9')}
        />
      )}
    </Field>
  );
}
