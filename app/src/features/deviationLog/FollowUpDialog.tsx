import type { FollowUpRequest } from '@modig/shared';
import clsx from 'clsx';
import { useRef, useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { DateInput } from '../../components/DateInput';
import { Dialog } from '../../components/Dialog';
import { Field, INPUT } from '../../components/Field';
import { localDate } from '../inspections/dates';

type Props = {
  /** "QC-2026-0004 · D-03" */
  deviationId: string;
  /** "2.c SMC filter - Cables labelled", so it is clear which one is being closed. */
  description: string;
  /** Editing a closed deviation (its values), or closing an open one (`action` as it is). */
  current: { status: 'open' | 'closed'; action: string; closedOn: string; closedBy: string };
  /** The signed-in person's name: who closes it unless another name is typed. */
  me: string;
  onSubmit: (request: FollowUpRequest) => void;
  onClose: () => void;
};

/**
 * Close a deviation: what was done, the day (today to start with) and who (the signed-in person).
 * The same for a closed one, to change what it says. Sending closes the dialog at once: the log
 * shows the change while it is saved, and says so if it couldn't be.
 */
export function FollowUpDialog({
  deviationId,
  description,
  current,
  me,
  onSubmit,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const editing = current.status === 'closed';
  const today = localDate();
  const [action, setAction] = useState(current.action);
  const [closedOn, setClosedOn] = useState(editing && current.closedOn ? current.closedOn : today);
  const [closedBy, setClosedBy] = useState(editing && current.closedBy ? current.closedBy : me);
  const close = () => dialogRef.current?.close();

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit({
      status: 'closed',
      action: action.trim(),
      closedOn,
      // Emptied: the server puts the signed-in person's name, as here.
      closedBy: closedBy.trim() || me,
    });
    close();
  }

  return (
    <Dialog
      dialogRef={dialogRef}
      title={editing ? `Edit ${deviationId}` : `Close ${deviationId}`}
      description={<span className="line-clamp-3 wrap-break-word">{description}</span>}
      onClose={onClose}
    >
      <form onSubmit={submit} className="mt-6 space-y-5">
        <Field label="Action taken" hint="What was done about it. Optional.">
          {(control) => (
            <textarea
              {...control}
              rows={4}
              maxLength={2000}
              value={action}
              onChange={(event) => setAction(event.target.value)}
              className={clsx(INPUT, 'min-h-24 resize-y py-2')}
            />
          )}
        </Field>
        <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
          <Field label="Closed on">
            {(control) => (
              <DateInput
                {...control}
                value={closedOn}
                onChange={setClosedOn}
                min="2000-01-01"
                // Not a day still to come: it records what has been done.
                max={today}
              />
            )}
          </Field>
          <Field label="Closed by">
            {(control) => (
              <input
                {...control}
                maxLength={200}
                autoComplete="off"
                value={closedBy}
                onChange={(event) => setClosedBy(event.target.value)}
                className={clsx(INPUT, 'h-9')}
              />
            )}
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit">{editing ? 'Save' : 'Close deviation'}</Button>
        </div>
      </form>
    </Dialog>
  );
}
