import type { FinaliseIssue } from '@modig/shared';
import { CircleAlert, CornerDownRight, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';

/** How a finalise or reopen ended, as far as the dialog is concerned. */
export type StateOutcome =
  | { kind: 'done' }
  /** The server found problems (finalise): list them instead. */
  | { kind: 'issues'; issues: FinaliseIssue[] }
  /** Someone else changed the inspection; the page shows the conflict. */
  | { kind: 'conflict' }
  | { kind: 'failed'; message: string };

type Props = {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  /** "Finalising…" */
  workingLabel: string;
  /** Problems found before anything was sent: listed with jump links instead of the question. */
  issues?: FinaliseIssue[];
  run: () => Promise<StateOutcome>;
  onGoTo?: (issue: FinaliseIssue) => void;
  onClose: () => void;
};

/**
 * Asks before finalising or reopening an inspection (brief §5.3), then does it. If the inspection
 * isn't ready, it lists what is missing, each a link to the place to fix it.
 */
export function StateChangeDialog({
  title,
  description,
  confirmLabel,
  workingLabel,
  issues: initialIssues = [],
  run,
  onGoTo,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [issues, setIssues] = useState(initialIssues);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const close = () => dialogRef.current?.close();

  // When the server answers with problems, the button that had the focus is gone: start the list.
  useEffect(() => {
    listRef.current?.querySelector('button')?.focus();
  }, [issues]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const outcome = await run();
    setBusy(false);
    if (outcome.kind === 'issues') setIssues(outcome.issues);
    else if (outcome.kind === 'failed') setError(outcome.message);
    else close();
  }

  if (issues.length > 0) {
    return (
      <Dialog
        dialogRef={dialogRef}
        title={`Fix ${issues.length === 1 ? 'one problem' : `${issues.length} problems`} before finalising`}
        description="A finalised inspection can’t be changed, so fix these first. They are marked in red."
        onClose={onClose}
      >
        <ul ref={listRef} className="mt-4 max-h-80 space-y-0.5 overflow-y-auto">
          {issues.map((issue, index) => (
            <li key={index}>
              <button
                type="button"
                onClick={() => {
                  // Closing hands the focus back to Finalise; then it moves to the problem.
                  close();
                  onGoTo?.(issue);
                }}
                className="group flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-ink-900 transition-colors hover:bg-nok-bg"
              >
                <CircleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-nok-fg" />
                <span className="min-w-0 flex-1">{issue.message}</span>
                <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-700 group-hover:underline">
                  <CornerDownRight size={13} aria-hidden="true" />
                  Go to it
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex justify-end">
          <Button variant="secondary" onClick={close}>
            Close
          </Button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      dialogRef={dialogRef}
      title={title}
      description={description}
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={(event) => void submit(event)} className="mt-6">
        {error && (
          <p role="alert" className="mb-4 text-sm font-medium text-nok-fg">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          {/* aria-disabled while working: a disabled button would drop the keyboard focus. */}
          <Button
            type="submit"
            aria-disabled={busy || undefined}
            className="aria-disabled:opacity-50"
          >
            {busy && <LoaderCircle size={16} aria-hidden="true" className="animate-spin" />}
            {busy ? workingLabel : error ? 'Try again' : confirmLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
