import { assemblyFileStepCount } from '@modig/shared';
import clsx from 'clsx';
import { CircleAlert, CircleCheck, FileJson, LoaderCircle } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { INPUT } from '../../components/Field';
import { errorMessage } from '../../lib/api';
import { MachineModelFields } from '../templates/MachineModelFields';
import {
  initialChoice,
  resolvedModel,
  type ModelChoice,
  type ModelContext,
} from '../templates/modelChoice';
import { assemblyHref, useImportTemplate } from '../templates/queries';
import { ASSEMBLY_MODEL_HINT } from './models';
import type { PickedFile } from './transfer';
import { stepCountText, taskCountText } from './wording';

type Props = {
  /** The chosen files, read and checked (transfer.ts): instructions, and files that are none. */
  picked: PickedFile[];
  models: ModelContext;
  onClose: () => void;
};

/** How one file's import went. */
type Outcome =
  | { status: 'waiting' }
  | { status: 'importing' }
  | { status: 'done'; id: string; droppedImages: number }
  | { status: 'failed'; message: string };

/**
 * Import JSON for assembly instructions, one file or many at once: each file becomes a new,
 * unpublished draft for the machine model chosen here, under the name in its line (the file's to
 * start with). A file that is no assembly instruction is listed with the reason and left out.
 * They are imported one after another; each line then says how it went and links to its draft.
 */
export function ImportAssemblyDialog({ picked, models, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const importing = useImportTemplate();
  const good = picked.flatMap((entry, index) => ('file' in entry ? [{ ...entry, index }] : []));
  const bad = picked.filter((entry) => 'error' in entry);
  const first = good[0]?.file.instruction;
  const [choice, setChoice] = useState<ModelChoice>(() =>
    initialChoice(
      models,
      first?.modelCode ? { code: first.modelCode, name: first.modelName } : undefined,
    ),
  );
  const [names, setNames] = useState<Record<number, string>>(() =>
    Object.fromEntries(good.map(({ index, file }) => [index, file.instruction.name])),
  );
  const [outcomes, setOutcomes] = useState<Record<number, Outcome>>({});
  const [running, setRunning] = useState(false);
  const model = resolvedModel(choice, models);
  const started = Object.keys(outcomes).length > 0;
  const finished = started && !running;
  const left = good.filter(({ index }) => outcomes[index]?.status !== 'done');
  const ready = model !== null && left.every(({ index }) => names[index]?.trim());

  async function run(event: FormEvent) {
    event.preventDefault();
    if (!model || !ready) return;
    setRunning(true);
    const { modelName: _name, newModel, modelCode } = model;
    // A new machine model is added with the first instruction; the others then find it there.
    let addModel = newModel;
    for (const { index, file } of left) {
      setOutcomes((current) => ({ ...current, [index]: { status: 'importing' } }));
      try {
        const { loaded, droppedImages } = await importing.mutateAsync({
          kind: 'assembly',
          name: (names[index] ?? '').trim(),
          modelCode,
          ...(addModel && { newModel: addModel }),
          file,
        });
        addModel = undefined;
        setOutcomes((current) => ({
          ...current,
          [index]: { status: 'done', id: loaded.detail.draft.id, droppedImages },
        }));
      } catch (error) {
        setOutcomes((current) => ({
          ...current,
          [index]: { status: 'failed', message: errorMessage(error) },
        }));
      }
    }
    setRunning(false);
  }

  const count = good.length;
  return (
    <Dialog
      dialogRef={dialogRef}
      title={count === 1 ? 'Import assembly instruction' : 'Import assembly instructions'}
      description={
        count === 0
          ? 'None of the chosen files can be imported.'
          : `${count === 1 ? 'It becomes a new draft' : `Each of the ${count} files becomes a new draft`} for the machine model chosen here. Pictures come along only if they are stored in this installation.`
      }
      onClose={onClose}
      busy={running}
      className="w-[min(42rem,calc(100vw-2rem))]"
    >
      <form onSubmit={(event) => void run(event)} className="mt-6 space-y-5">
        {count > 0 && !started && (
          <MachineModelFields
            choice={choice}
            context={models}
            onChange={setChoice}
            existingHint={ASSEMBLY_MODEL_HINT}
          />
        )}
        <ul className="space-y-2">
          {good.map(({ index, fileName, file }) => {
            const outcome = outcomes[index] ?? { status: 'waiting' };
            const tasks = file.instruction.tasks.length;
            return (
              <li key={index} className="rounded-lg border border-ink-200 p-3">
                <p className="flex items-center gap-2 text-xs text-ink-500">
                  <FileJson size={14} aria-hidden="true" className="shrink-0" />
                  <span className="min-w-0 truncate">{fileName}</span>
                  <span className="shrink-0 tabular-nums">
                    · {taskCountText(tasks)} · {stepCountText(assemblyFileStepCount(file))}
                  </span>
                </p>
                {outcome.status === 'done' ? (
                  <p className="mt-2 flex items-start gap-2 text-sm text-ink-900">
                    <CircleCheck
                      size={16}
                      aria-hidden="true"
                      className="mt-0.5 shrink-0 text-ok-fg"
                    />
                    <span className="min-w-0">
                      Imported as{' '}
                      <Link
                        to={assemblyHref(outcome.id)}
                        className="font-medium text-brand-700 underline underline-offset-2"
                      >
                        {names[index]}
                      </Link>
                      .
                      {outcome.droppedImages > 0 &&
                        ` ${outcome.droppedImages === 1 ? 'One picture was' : `${outcome.droppedImages} pictures were`} left out: not stored in this installation.`}
                    </span>
                  </p>
                ) : (
                  <>
                    <input
                      aria-label={`Name of the instruction from ${fileName}`}
                      required
                      maxLength={200}
                      autoComplete="off"
                      disabled={running}
                      value={names[index] ?? ''}
                      onChange={(event) =>
                        setNames((current) => ({ ...current, [index]: event.target.value }))
                      }
                      className={clsx(INPUT, 'mt-2 h-9')}
                    />
                    {outcome.status === 'importing' && (
                      <p className="mt-2 flex items-center gap-2 text-sm text-ink-600">
                        <LoaderCircle size={14} aria-hidden="true" className="animate-spin" />
                        Importing…
                      </p>
                    )}
                    {outcome.status === 'failed' && (
                      <p role="alert" className="mt-2 text-sm font-medium text-nok-fg">
                        Not imported. {outcome.message}
                      </p>
                    )}
                  </>
                )}
              </li>
            );
          })}
          {bad.map((entry, index) => (
            <li
              key={`bad-${index}`}
              className="flex items-start gap-2 rounded-lg border border-nok-fg/40 bg-nok-bg p-3 text-sm text-ink-900"
            >
              <CircleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-nok-fg" />
              <span className="min-w-0">
                <span className="font-medium">“{entry.fileName}” can’t be imported.</span>{' '}
                {'error' in entry ? entry.error : ''}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={() => dialogRef.current?.close()} disabled={running}>
            {finished && left.length === 0 ? 'Close' : 'Cancel'}
          </Button>
          {left.length > 0 && (
            <Button type="submit" disabled={running || !ready}>
              {running && <LoaderCircle size={16} aria-hidden="true" className="animate-spin" />}
              {running
                ? 'Importing…'
                : started
                  ? 'Try again'
                  : left.length === 1
                    ? 'Import'
                    : `Import ${left.length} instructions`}
            </Button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
