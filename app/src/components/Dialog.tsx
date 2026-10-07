import clsx from 'clsx';
import { useEffect, useId, type ReactNode, type RefObject } from 'react';

type Props = {
  /** Owned by the caller, so it can close the dialog: `dialogRef.current?.close()`. */
  dialogRef: RefObject<HTMLDialogElement | null>;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Runs once the dialog has closed (Escape or close()); unmount it then. */
  onClose: () => void;
  /** While true, Escape and other close requests don't close it (a request is running). */
  busy?: boolean;
  className?: string;
};

/**
 * A modal on the native <dialog>: focus trap, Escape and an inert page for free, and closing it
 * hands focus back to whatever opened it. It opens itself when mounted. A click on the backdrop
 * does not close it, so a half-filled form isn't lost by accident.
 */
export function Dialog({
  dialogRef,
  title,
  description,
  children,
  onClose,
  busy,
  className,
}: Props) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, [dialogRef]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={onClose}
      // Chrome lets a page refuse only one Escape per user activation: the next one closes the
      // dialog even though `cancel` is prevented. `closedby="none"` ignores close requests, while
      // close() from script still works; the cancel guard covers browsers without it.
      closedby={busy ? 'none' : undefined}
      onCancel={(event) => {
        if (busy) event.preventDefault();
      }}
      className={clsx(
        'm-auto max-h-[calc(100dvh-2rem)] w-[min(32rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-ink-200 bg-surface p-0 text-ink-900 shadow-xl backdrop:bg-ink-950/30',
        className,
      )}
    >
      <div className="p-6">
        <h2 id={titleId} className="text-base font-semibold">
          {title}
        </h2>
        {description && (
          <div id={descriptionId} className="mt-1.5 text-sm text-ink-600">
            {description}
          </div>
        )}
        {children}
      </div>
    </dialog>
  );
}
