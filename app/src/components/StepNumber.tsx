/** The number of a step in a form that is filled in from the top: a small filled circle. */
export function StepNumber({ step }: { step: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white tabular-nums"
    >
      {step}
    </span>
  );
}
