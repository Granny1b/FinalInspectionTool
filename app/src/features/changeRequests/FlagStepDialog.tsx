import { ChangeRequestMessageSchema } from '@modig/shared';
import clsx from 'clsx';
import { Flag, LoaderCircle } from 'lucide-react';
import { useId, useRef, useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { INPUT } from '../../components/Field';
import { errorMessage } from '../../lib/api';
import { useFlagStep } from './queries';

/** Where a step is flagged from: the instruction, and the machine when it is on one. */
export type FlagTarget = { templateId: string; machineId?: string | undefined };

type Props = {
  target: FlagTarget;
  itemId: string;
  /** "1.3" and the step's text, to say which step it is. */
  stepRef: string;
  stepText: string;
  onSent: () => void;
  onClose: () => void;
};

/**
 * A small form to say what is wrong with a step: one text box, sent to the admins, who write the
 * instructions. The step itself is not changed.
 */
export function FlagStepDialog({ target, itemId, stepRef, stepText, onSent, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const flag = useFlagStep();
  const [message, setMessage] = useState('');
  const fieldId = useId();
  const valid = ChangeRequestMessageSchema.safeParse(message).success;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    flag.mutate(
      { ...target, itemId, message },
      {
        onSuccess: () => {
          onSent();
          dialogRef.current?.close();
        },
      },
    );
  }

  return (
    <Dialog
      dialogRef={dialogRef}
      title={`Something wrong with step ${stepRef}?`}
      description={
        <>
          <span className="font-medium text-ink-800">{stepText || 'Empty step'}</span>
          <span className="mt-1 block">
            Say what should be changed. It is sent to the admins who write the instructions; the
            step stays as it is until they change it.
          </span>
        </>
      }
      onClose={onClose}
      busy={flag.isPending}
    >
      <form onSubmit={submit} className="mt-5">
        <label htmlFor={fieldId} className="block text-sm font-medium text-ink-800">
          What is wrong?
        </label>
        <textarea
          id={fieldId}
          autoFocus
          required
          rows={4}
          maxLength={2000}
          placeholder="E.g. the bolt list misses the washers, or the picture shows the old bracket."
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          className={clsx(INPUT, 'mt-1.5 resize-y py-2 leading-5')}
        />
        {flag.isError && (
          <p role="alert" className="mt-3 text-sm font-medium text-nok-fg">
            It was not sent. {errorMessage(flag.error)}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => dialogRef.current?.close()}
            disabled={flag.isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={flag.isPending || !valid}>
            {flag.isPending ? (
              <LoaderCircle size={16} aria-hidden="true" className="animate-spin" />
            ) : (
              <Flag size={16} aria-hidden="true" />
            )}
            {flag.isPending ? 'Sending…' : 'Send to the admins'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
