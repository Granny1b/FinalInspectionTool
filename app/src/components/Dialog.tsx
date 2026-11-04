import clsx from 'clsx';
import { useEffect, useId, type ReactNode, type RefObject } from 'react';
import './dialog.css';

type Props = {
  /** Owned by the caller, so it can close the dialog: `dialogRef.current?.close()`. */
  dialogRef: RefObject<HTMLDialogElement | null>;
  title: string;
  description?: ReactNode;
  /** Ends with the row of buttons, as its last element or the last element of its form. */
  children: ReactNode;
  /** Runs once the dialog has closed (Escape or close()); unmount it then. */
  onClose: () => void;
  /** While true, Escape and other close requests don't close it (a request is running). */
  busy?: boolean;
  className?: string;
};

/**
 * The frame of a modal, here and in ConfirmDialog. An overlay: in the dark theme it is lighter
 * than the cards under it, as a shadow doesn't show on near-black, and the backdrop dims the
 * page more. Taller than the screen it scrolls; the scroll padding keeps a focused field clear
 * of the row of buttons that sticks to its bottom (dialog.css).
 */
export const DIALOG_FRAME =
  'm-auto max-h-[calc(100dvh-2rem)] scroll-pb-24 overflow-y-auto overscroll-contain rounded-xl border border-ink-200 bg-overlay p-0 text-ink-900 shadow-xl backdrop:bg-scrim/30 dark:border-ink-300 dark:backdrop:bg-scrim/70';

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
      className={clsx(DIALOG_FRAME, 'w-[min(32rem,calc(100vw-2rem))]', className)}
    >
      <div className="dialog-body p-6">
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
