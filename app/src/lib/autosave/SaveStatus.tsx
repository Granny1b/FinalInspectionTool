import { CONFLICT_MESSAGE } from '@modig/shared';
import { Check, CircleAlert, CloudAlert, LoaderCircle } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import type { AutosaveState } from './autosave';

const ACTION = 'rounded-sm font-medium underline underline-offset-2 hover:text-ink-900';

type Props = {
  state: AutosaveState;
  /** Another request (publish, finalise) found that someone else changed it (a banner explains). */
  conflict: boolean;
  onRetry: () => void;
  /** The way out of a conflict, here too: the banner may be scrolled out of view. */
  onReload: () => void;
};

/**
 * "Saving… / Saved / Unsaved changes / Couldn't save — Retry / Not saved — Reload", in the page's
 * sticky header.
 */
export function SaveStatus({ state, conflict, onRetry, onReload }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    // Announced politely; the conflict and failed-save banners use role="alert" themselves.
    // Focusable from script only: Retry disappears once saved, and focus stays here.
    <div
      ref={ref}
      role="status"
      tabIndex={-1}
      className="flex h-9 items-center text-sm whitespace-nowrap text-ink-500 outline-none"
    >
      {conflict || state.status === 'conflict' ? (
        <Line icon={<CircleAlert size={16} />} className="text-nok-fg" title={CONFLICT_MESSAGE}>
          Not saved —
          <button type="button" onClick={onReload} className={ACTION}>
            Reload
          </button>
        </Line>
      ) : state.status === 'saved' ? (
        <Line icon={<Check size={16} />}>Saved</Line>
      ) : state.status === 'pending' ? (
        // A small dot: something is waiting to be saved.
        <Line icon={<span className="m-[5px] size-1.5 rounded-full bg-brand-600" />}>
          Unsaved changes
        </Line>
      ) : state.status === 'saving' ? (
        <Line icon={<LoaderCircle size={16} className="animate-spin" />}>Saving…</Line>
      ) : (
        <Line icon={<CloudAlert size={16} />} className="text-nok-fg" title={state.message}>
          Couldn’t save —
          <button
            type="button"
            onClick={() => {
              ref.current?.focus();
              onRetry();
            }}
            className={ACTION}
          >
            Retry
          </button>
        </Line>
      )}
    </div>
  );
}

type LineProps = { icon: ReactNode; className?: string; title?: string; children: ReactNode };

function Line({ icon, className, title, children }: LineProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ''}`} title={title}>
      <span aria-hidden="true" className="flex">
        {icon}
      </span>
      {children}
    </span>
  );
}
