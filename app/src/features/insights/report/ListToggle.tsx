import clsx from 'clsx';
import { useId } from 'react';
import type { Choice } from '../../print/PrintToolbar';

type Props = Choice<boolean> & {
  /** False when the selection has no deviations: there is nothing to list. */
  available: boolean;
};

/**
 * "Include deviation list", drawn as the inspection printout's "Include reference images": greyed
 * out, and saying why, when there is nothing to list.
 */
export function ListToggle({ value, onChange, available }: Props) {
  const noteId = useId();
  return (
    <div>
      <label
        className={clsx(
          'flex items-center gap-2 text-sm whitespace-nowrap pointer-coarse:min-h-10',
          available ? 'text-ink-800' : 'text-ink-500',
        )}
      >
        <input
          type="checkbox"
          className="size-4 accent-brand-600"
          checked={available && value}
          disabled={!available}
          onChange={(event) => onChange(event.target.checked)}
          aria-describedby={available ? undefined : noteId}
        />
        Include deviation list
      </label>
      {!available && (
        <p id={noteId} className="pl-6 text-xs text-ink-500">
          No deviations in this selection
        </p>
      )}
    </div>
  );
}
