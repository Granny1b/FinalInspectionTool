import clsx from 'clsx';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from './Button';
import { DIALOG_FRAME } from './Dialog';

type Props = {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Confirmation in a native modal <dialog>: focus trap, Escape and an inert page for free.
 * Mount it to ask; it opens itself, and closing calls exactly one of the callbacks.
 */
export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={messageId}
      // The form's submit buttons set returnValue; Escape and the backdrop leave it empty.
      onClose={(event) =>
        event.currentTarget.returnValue === 'confirm' ? onConfirm() : onCancel()
      }
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      className={clsx(DIALOG_FRAME, 'w-[min(28rem,calc(100vw-2rem))]')}
    >
      <form method="dialog" className="dialog-body p-6">
        <h2 id={titleId} className="text-base font-semibold">
          {title}
        </h2>
        <p id={messageId} className="mt-2 text-sm text-ink-600">
          {message}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          {/* First, so showModal() focuses the safe choice. */}
          <Button type="submit" value="cancel" variant="secondary">
            Cancel
          </Button>
          <Button type="submit" value="confirm" variant="danger">
            {confirmLabel}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
