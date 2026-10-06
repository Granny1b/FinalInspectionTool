import { Hourglass } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Button } from './Button';

type Props = {
  children: ReactNode;
  /** The brief's build phase that delivers this action; omit when no phase is scheduled yet. */
  phase?: number;
};

/** An action that belongs to a later phase: shown so the page makes sense, but honestly disabled. */
export function PlannedAction({ children, phase }: Props) {
  const hintId = useId();
  return (
    <div className="flex flex-col items-center gap-2">
      <Button disabled aria-describedby={hintId}>
        {children}
      </Button>
      <p id={hintId} className="inline-flex items-center gap-1.5 text-xs text-ink-500">
        <Hourglass size={12} />
        {phase ? `Coming in phase ${phase}` : 'Coming in a later phase'}
      </p>
    </div>
  );
}
