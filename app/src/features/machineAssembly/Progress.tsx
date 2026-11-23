import clsx from 'clsx';

/** A bar that fills as steps are signed, green once every one is. */
export function ProgressBar({
  signed,
  steps,
  className,
}: {
  signed: number;
  steps: number;
  className?: string;
}) {
  const done = steps > 0 && signed === steps;
  const percent = steps === 0 ? 0 : Math.round((signed / steps) * 100);
  return (
    <div
      role="progressbar"
      aria-label="Steps signed"
      aria-valuemin={0}
      aria-valuemax={steps}
      aria-valuenow={signed}
      aria-valuetext={`${signed} of ${steps} steps signed`}
      className={clsx('h-2 overflow-hidden rounded-full bg-ink-100', className)}
    >
      <div
        className={clsx(
          'h-full rounded-full transition-[width]',
          done ? 'bg-ok-fg' : 'bg-brand-600',
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
