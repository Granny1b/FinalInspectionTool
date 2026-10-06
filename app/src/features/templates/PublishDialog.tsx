import type { PublishIssue } from '@modig/shared';
import clsx from 'clsx';
import { CircleAlert, CornerDownRight, LoaderCircle, Upload } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Field, INPUT } from '../../components/Field';
import { focusIssue, templateIssueField } from './publishIssues';
import { errorMessage, isConflict, publishIssuesOf } from './queries';

export type FlushResult = 'saved' | 'conflict' | 'failed';

type Props = {
  /** The number this publish creates. */
  revision: number;
  /** Problems found in the draft when the dialog opened: they are listed instead of the form. */
  issues: PublishIssue[];
  nameBlank: boolean;
  /** Saves pending edits first, so what gets published is what the user sees. */
  flush: () => Promise<FlushResult>;
  /** Publishes the saved draft; rejects with the API's error. */
  publish: (changeNote: string) => Promise<void>;
  /** The server found problems: highlight them in the checklist too. */
  onIssues: () => void;
  /** Someone else changed the draft; the editor shows the conflict. */
  onConflict: () => void;
  onClose: () => void;
};

/**
 * "Publish revision N" with an optional change note (brief §5.2). If the draft isn't complete it
 * lists the problems instead, each a link to the row or section to fix.
 */
export function PublishDialog({
  revision,
  issues,
  nameBlank,
  flush,
  publish,
  onIssues,
  onConflict,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [serverIssues, setServerIssues] = useState<PublishIssue[] | null>(null);
  const [step, setStep] = useState<'idle' | 'saving' | 'publishing'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const close = () => dialogRef.current?.close();
  const busy = step !== 'idle';

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setStep('saving');
    const flushed = await flush();
    if (flushed !== 'saved') {
      setStep('idle');
      if (flushed === 'conflict') return conflict();
      setError(
        'Your latest changes couldn’t be saved, so nothing was published. Check your connection and try again.',
      );
      return;
    }
    setStep('publishing');
    try {
      await publish(note);
      close();
    } catch (failure) {
      setStep('idle');
      if (isConflict(failure)) return conflict();
      const found = publishIssuesOf(failure);
      if (found) {
        setServerIssues(found);
        onIssues();
      } else {
        setError(errorMessage(failure));
      }
    }
  }

  function conflict() {
    onConflict();
    close();
  }

  const problems = serverIssues ?? issues;
  if (problems.length > 0) {
    return (
      <Dialog
        dialogRef={dialogRef}
        title={`Fix ${problems.length === 1 ? 'one problem' : `${problems.length} problems`} before publishing`}
        description="A published revision can’t be changed, so the checklist has to be complete first. They are marked in red in the checklist."
        onClose={onClose}
      >
        <ul className="mt-4 max-h-80 space-y-0.5 overflow-y-auto">
          {problems.map((issue, index) => (
            <li key={index}>
              <button
                type="button"
                onClick={() => {
                  // Closing hands focus back to the Publish button; then move it to the problem.
                  close();
                  focusIssue(issue.target, templateIssueField(problems, issue, nameBlank));
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
      title={`Publish revision ${revision}`}
      description="New inspections will use this revision. A published revision can’t be changed: later edits go into the next one."
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={(event) => void submit(event)} className="mt-5 space-y-5">
        <Field label="Change note (optional)" hint="What changed, for the revision history.">
          {(control) => (
            <textarea
              {...control}
              rows={3}
              maxLength={1000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className={clsx(INPUT, 'min-h-20 resize-y py-2')}
            />
          )}
        </Field>
        {error && (
          <p role="alert" className="text-sm font-medium text-nok-fg">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? (
              <LoaderCircle size={16} aria-hidden="true" className="animate-spin" />
            ) : (
              <Upload size={16} aria-hidden="true" />
            )}
            {step === 'saving'
              ? 'Saving changes…'
              : step === 'publishing'
                ? 'Publishing…'
                : `Publish revision ${revision}`}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
