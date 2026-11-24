import {
  assemblyProgress,
  formatMinutes,
  InitialsSchema,
  stepRef,
  stepsMinutes,
  totalMinutes,
  type AssemblySignOff,
  type AssemblySignOffs,
  type Item,
  type Section,
  type TaskProgress,
} from '@modig/shared';
import clsx from 'clsx';
import {
  Check,
  ChevronDown,
  CircleCheck,
  Flag,
  LoaderCircle,
  Search,
  Undo2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { formatDateTime } from '../../lib/format';
import { FlagStepDialog, type FlagTarget } from '../changeRequests/FlagStepDialog';
import { GuideViewer } from '../guides/GuideViewer';
import { PictureTile } from '../qualityChecks/PictureTile';
import type { IssueIndex } from '../templates/document/issues';
import { ISSUE_OUTLINE } from '../templates/document/layout';
import { IssueNote } from '../templates/document/parts';
import {
  departmentCounts,
  isFiltering,
  NO_FILTER,
  shownTasks,
  type ShownTask,
  type StepFilter,
} from './search';
import { BoltList, DocumentList, PartList, StepFacts } from './StepParts';
import { ASSEMBLY_GUIDE_WORDING, stepCountText } from './wording';

/**
 * Signing the steps off on a machine: who signed what, and how to sign and take a sign-off back.
 * Without it the instruction is only read.
 */
export type Signing = {
  signOffs: AssemblySignOffs;
  /** The initials steps are signed with; '' while none are entered (signing then asks for them). */
  initials: string;
  /**
   * Sign these steps as done: with `initials` when the field next to a step's button was changed
   * (they then become the ones to sign with), else with the ones above.
   */
  onSign: (itemIds: string[], initials?: string) => void;
  /** Take a step's sign-off back. */
  onUnsign: (itemId: string) => void;
  /** Whether the user may take this sign-off back (their own; an admin anyone's). */
  canUnsign: (signOff: AssemblySignOff) => boolean;
  /** The steps being signed or unsigned right now. */
  pending: ReadonlySet<string>;
  /** The signer's name for a sign-off's account, for its tooltip. */
  personName: (email: string) => string;
};

type Props = {
  sections: Section[];
  issues: IssueIndex;
  signing?: Signing | undefined;
  /**
   * Where a step is flagged for change from (the instruction, and the machine when on one):
   * every step then has a small flag button that opens a form for what is wrong.
   */
  flagFor?: FlagTarget | undefined;
};

/**
 * An assembly instruction to read: its tasks, each with its steps as cards (picture, what to do,
 * instructions, bolts, parts and documents). A search box and the departments narrow it to the
 * steps someone needs; the list of tasks jumps to one. A step's picture opens its pictures large.
 */
export function AssemblyView({ sections, issues, signing, flagFor }: Props) {
  const [filter, setFilter] = useState<StepFilter>(NO_FILTER);
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const [picturesOf, setPicturesOf] = useState<string | null>(null);
  const departments = useMemo(() => departmentCounts(sections), [sections]);
  // On a machine: only the steps still to sign.
  const [hideSigned, setHideSigned] = useState(false);
  const [signingTask, setSigningTask] = useState<string | null>(null);
  // The step being flagged for change, and whether one was just sent.
  const [flagging, setFlagging] = useState<string | null>(null);
  const [flagSent, setFlagSent] = useState(false);
  const flagged = flagging === null ? null : findStep(sections, flagging);
  const signOffs = signing?.signOffs;
  const progress = useMemo(
    () => (signOffs ? assemblyProgress(sections, signOffs) : null),
    [sections, signOffs],
  );
  const tasks = useMemo(() => {
    const shown = shownTasks(sections, filter);
    if (!hideSigned || !signOffs) return shown;
    return shown
      .map((task) => ({ ...task, steps: task.steps.filter(({ item }) => !signOffs[item.id]) }))
      .filter((task) => task.steps.length > 0);
  }, [sections, filter, hideSigned, signOffs]);
  const filtering = isFiltering(filter) || (hideSigned && signing !== undefined);
  const current = useCurrentTask(tasks);
  const viewing = picturesOf === null ? null : findStep(sections, picturesOf);

  if (sections.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-ink-500">
        This assembly instruction has no tasks yet.
      </p>
    );
  }

  const toggle = (sectionId: string) =>
    setFolded((current) => {
      const next = new Set(current);
      if (!next.delete(sectionId)) next.add(sectionId);
      return next;
    });
  const shownSteps = tasks.reduce((count, task) => count + task.steps.length, 0);

  return (
    <>
      <div className="mb-6 space-y-3">
        <div className="relative max-w-md">
          <Search
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-500"
          />
          <input
            type="search"
            aria-label="Search the steps"
            placeholder="Search steps, part numbers, bolts…"
            value={filter.query}
            onChange={(event) => setFilter({ ...filter, query: event.target.value })}
            className="h-10 w-full rounded-md border border-ink-500/80 bg-surface pr-3 pl-9 text-sm text-ink-900 shadow-xs placeholder:text-ink-500 hover:border-ink-600 focus-visible:border-brand-600 focus-visible:outline-1 focus-visible:outline-offset-0 dark:border-ink-400"
          />
        </div>
        {departments.length > 1 && (
          <div role="group" aria-label="Department" className="flex flex-wrap gap-1.5">
            <DepartmentChip
              label="All"
              pressed={filter.department === ''}
              onClick={() => setFilter({ ...filter, department: '' })}
            />
            {departments.map(({ name, steps }) => (
              <DepartmentChip
                key={name}
                label={name}
                count={steps}
                pressed={filter.department === name}
                onClick={() =>
                  setFilter({ ...filter, department: filter.department === name ? '' : name })
                }
              />
            ))}
          </div>
        )}
        {signing && (
          <label className="flex w-fit items-center gap-2 text-sm text-ink-800">
            <input
              type="checkbox"
              checked={hideSigned}
              onChange={(event) => setHideSigned(event.target.checked)}
              className="size-4 accent-brand-600"
            />
            Only steps not signed yet
          </label>
        )}
        {filtering && (
          <p
            role="status"
            className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-600"
          >
            <span>
              {shownSteps === 0
                ? 'No steps match.'
                : `${stepCountText(shownSteps)} in ${tasks.length === 1 ? '1 task' : `${tasks.length} tasks`}.`}
            </span>
            <button
              type="button"
              onClick={() => {
                setFilter(NO_FILTER);
                setHideSigned(false);
              }}
              className="inline-flex items-center gap-1 rounded-sm font-medium text-brand-700 hover:text-brand-800"
            >
              <X size={14} aria-hidden="true" />
              Show all steps
            </button>
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-8 @min-[60rem]:grid-cols-[13rem_minmax(0,1fr)]">
        <TaskOutline
          tasks={tasks}
          sections={sections}
          filtering={filtering}
          progress={progress?.tasks}
          currentId={current}
        />
        <div className="min-w-0">
          {tasks.map((task) => (
            <TaskSection
              key={task.section.id}
              task={task}
              filtering={filtering}
              // A search shows what it found, folded or not.
              folded={!filtering && folded.has(task.section.id)}
              onToggle={() => toggle(task.section.id)}
              issues={issues}
              onOpenPictures={setPicturesOf}
              signing={signing}
              onFlag={flagFor ? setFlagging : undefined}
              progress={progress?.tasks.find((entry) => entry.sectionId === task.section.id)}
              onSignTask={() => setSigningTask(task.section.id)}
            />
          ))}
        </div>
      </div>

      {flagFor && flagging !== null && flagged && (
        <FlagStepDialog
          target={flagFor}
          itemId={flagging}
          stepRef={flagged.ref}
          stepText={flagged.item.text}
          onSent={() => setFlagSent(true)}
          onClose={() => setFlagging(null)}
        />
      )}
      {flagSent && (
        // At the bottom of the window, as the undo of a delete: said where the eyes are.
        <div
          role="status"
          className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4"
        >
          <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-ok-border bg-ok-bg py-2 pr-1.5 pl-4 text-sm font-medium text-ok-fg shadow-lg">
            <CircleCheck size={16} aria-hidden="true" />
            Sent to the admins. Thank you.
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setFlagSent(false)}
              className="flex size-8 items-center justify-center rounded-md hover:bg-ok-border/40"
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
      {signing && signingTask !== null && (
        <SignTaskDialog
          sections={sections}
          sectionId={signingTask}
          signing={signing}
          onClose={() => setSigningTask(null)}
        />
      )}
      {viewing?.item.guide && (
        <GuideViewer
          rowRef={viewing.ref}
          rowText={viewing.item.text}
          guide={viewing.item.guide}
          wording={ASSEMBLY_GUIDE_WORDING}
          onClose={() => setPicturesOf(null)}
        />
      )}
    </>
  );
}

/** How far below the top of the window a task's heading counts as reached (the sticky headers). */
const READING_LINE = 140;

/**
 * The task being read: the last one whose heading has reached the top of the window, or the
 * first while none has. Followed as anything scrolls (the page, or a container around it).
 */
function useCurrentTask(tasks: readonly ShownTask[]): string | null {
  const [current, setCurrent] = useState<string | null>(null);
  const idsKey = tasks.map((task) => task.section.id).join(' ');
  useEffect(() => {
    const ids = idsKey ? idsKey.split(' ') : [];
    let frame = 0;
    const measure = () => {
      frame = 0;
      let reached: string | null = ids[0] ?? null;
      for (const id of ids) {
        const element = document.getElementById(`section-${id}`);
        if (element && element.getBoundingClientRect().top <= READING_LINE) reached = id;
      }
      setCurrent(reached);
    };
    // Once per frame however many scroll events arrive.
    const onScroll = () => {
      frame ||= requestAnimationFrame(measure);
    };
    onScroll();
    // Captured, so a scrolling container's events count too (they don't bubble).
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', onScroll);
    };
  }, [idsKey]);
  return current;
}

/** Asks before a whole task's remaining steps are signed in one go. */
function SignTaskDialog({
  sections,
  sectionId,
  signing,
  onClose,
}: {
  sections: readonly Section[];
  sectionId: string;
  signing: Signing;
  onClose: () => void;
}) {
  const index = sections.findIndex((section) => section.id === sectionId);
  const section = sections[index];
  const remaining = (section?.items ?? []).filter((item) => !signing.signOffs[item.id]);
  if (!section || remaining.length === 0) return null;
  return (
    <ConfirmDialog
      title={`Sign task ${index + 1} as done?`}
      message={`${remaining.length === 1 ? 'The remaining step' : `All ${remaining.length} remaining steps`} of “${section.title || 'Untitled task'}” ${remaining.length === 1 ? 'is' : 'are'} signed as done by ${signing.initials}.`}
      confirmLabel="Sign task"
      onConfirm={() => {
        onClose();
        signing.onSign(remaining.map((item) => item.id));
      }}
      onCancel={onClose}
    />
  );
}

function findStep(sections: readonly Section[], itemId: string) {
  for (const [taskIndex, section] of sections.entries()) {
    const stepIndex = section.items.findIndex((item) => item.id === itemId);
    const item = section.items[stepIndex];
    if (item) return { item, ref: stepRef(taskIndex, stepIndex) };
  }
  return null;
}

function DepartmentChip({
  label,
  count,
  pressed,
  onClick,
}: {
  label: string;
  count?: number;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={clsx(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors',
        pressed
          ? 'border-brand-600 bg-brand-50 text-brand-800'
          : 'border-ink-300 bg-surface text-ink-700 hover:border-ink-400 hover:bg-ink-50',
      )}
    >
      {label}
      {count !== undefined && <span className="text-xs text-ink-500 tabular-nums">{count}</span>}
    </button>
  );
}

/** The tasks as a list of links that stays in view beside the steps on a wide sheet. */
function TaskOutline({
  tasks,
  sections,
  filtering,
  progress,
  currentId,
}: {
  tasks: ShownTask[];
  sections: Section[];
  filtering: boolean;
  /** On a machine: how far each task has come. */
  progress?: TaskProgress[] | undefined;
  /** The task being read: the one at the top of the window. */
  currentId: string | null;
}) {
  // The list scrolls on its own when it is longer than the window: the task being read is kept
  // in sight in it, without moving the page.
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const nav = listRef.current?.parentElement;
    const link = currentId
      ? listRef.current?.querySelector<HTMLElement>(`[data-task-link="${CSS.escape(currentId)}"]`)
      : null;
    if (!nav || !link || nav.scrollHeight <= nav.clientHeight) return;
    const box = nav.getBoundingClientRect();
    const at = link.getBoundingClientRect();
    if (at.top < box.top) nav.scrollTop -= box.top - at.top + 8;
    else if (at.bottom > box.bottom) nav.scrollTop += at.bottom - box.bottom + 8;
  }, [currentId]);
  const of = (sectionId: string) => progress?.find((entry) => entry.sectionId === sectionId);
  return (
    <nav
      aria-label="Tasks"
      className="self-start @min-[60rem]:sticky @min-[60rem]:top-24 @min-[60rem]:max-h-[calc(100dvh-8rem)] @min-[60rem]:overflow-y-auto"
    >
      <p className="mb-2 flex items-baseline justify-between gap-2 text-xs font-medium tracking-wide text-ink-500 uppercase">
        Tasks
        <span className="font-normal tracking-normal normal-case tabular-nums">
          {formatMinutes(totalMinutes(sections))}
        </span>
      </p>
      <ol
        ref={listRef}
        className="flex flex-wrap gap-1 @min-[60rem]:block @min-[60rem]:space-y-0.5"
      >
        {tasks.map(({ section, index, steps }) => (
          <li key={section.id}>
            <a
              href={`#section-${section.id}`}
              data-task-link={section.id}
              // The task being read stands out: a filled row with a bar at its edge.
              aria-current={section.id === currentId ? 'location' : undefined}
              className={clsx(
                'max-@min-[60rem]:border flex items-baseline gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                section.id === currentId
                  ? 'max-@min-[60rem]:border-brand-600 bg-brand-50 font-semibold text-brand-800 shadow-[inset_3px_0_0_var(--color-brand-600)]'
                  : 'max-@min-[60rem]:border-ink-200 text-ink-700 hover:bg-ink-100 hover:text-ink-900',
              )}
            >
              {of(section.id)?.done ? (
                <CircleCheck
                  size={15}
                  aria-label="Completed"
                  className="w-5 shrink-0 translate-y-0.5 text-ok-fg"
                />
              ) : (
                <span className="w-5 shrink-0 text-right text-xs font-semibold text-ink-500 tabular-nums">
                  {index + 1}
                </span>
              )}
              <span
                className={clsx(
                  'min-w-0 flex-1 truncate',
                  of(section.id)?.done && section.id !== currentId && 'font-medium text-ok-fg',
                )}
              >
                {section.title || 'Untitled task'}
              </span>
              <span className="shrink-0 text-xs text-ink-500 tabular-nums">
                {filtering
                  ? steps.length
                  : of(section.id)
                    ? `${of(section.id)!.signed}/${section.items.length}`
                    : section.items.length}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function TaskSection({
  task,
  filtering,
  folded,
  onToggle,
  issues,
  onOpenPictures,
  signing,
  onFlag,
  progress,
  onSignTask,
}: {
  task: ShownTask;
  filtering: boolean;
  folded: boolean;
  onToggle: () => void;
  issues: IssueIndex;
  onOpenPictures: (itemId: string) => void;
  signing?: Signing | undefined;
  onFlag?: ((itemId: string) => void) | undefined;
  progress?: TaskProgress | undefined;
  onSignTask: () => void;
}) {
  const { section, index, steps } = task;
  const done = progress?.done ?? false;
  const sectionIssues = issues.sections.get(section.id);
  const titleId = `section-title-${section.id}`;
  return (
    <section
      id={`section-${section.id}`}
      aria-labelledby={titleId}
      className="mt-8 scroll-mt-24 first:mt-0"
    >
      <div className={clsx(sectionIssues && ISSUE_OUTLINE)}>
        <h2 id={titleId}>
          <button
            type="button"
            aria-expanded={!folded}
            disabled={filtering}
            onClick={onToggle}
            className={clsx(
              'flex min-h-12 w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors',
              done
                ? 'border-ok-fg bg-ok-bg'
                : clsx(
                    'border-ink-200 enabled:hover:border-ink-300',
                    sectionIssues ? 'bg-inherit' : 'bg-ink-50',
                  ),
            )}
          >
            <span
              className={clsx(
                'flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white tabular-nums',
                done ? 'bg-ok-fg' : 'bg-brand-600',
              )}
            >
              {done ? <Check size={16} strokeWidth={3} aria-hidden="true" /> : index + 1}
            </span>
            <span className="min-w-0 flex-1 text-base font-semibold wrap-break-word text-ink-900">
              {section.title || <span className="font-normal text-ink-500">Untitled task</span>}
            </span>
            {done && <span className="shrink-0 text-sm font-semibold text-ok-fg">Completed</span>}
            <span
              className={clsx(
                'shrink-0 text-xs tabular-nums',
                done ? 'text-ok-fg' : 'text-ink-500',
              )}
            >
              {filtering
                ? `${steps.length} of ${section.items.length}`
                : progress
                  ? `${progress.signed} of ${progress.steps} signed`
                  : `${stepCountText(section.items.length)} · ${formatMinutes(stepsMinutes(section.items))}`}
            </span>
            {!filtering && (
              <ChevronDown
                size={16}
                aria-hidden="true"
                className={clsx(
                  'shrink-0 text-ink-500 transition-transform',
                  folded && '-rotate-90',
                )}
              />
            )}
          </button>
        </h2>
        {sectionIssues && <IssueNote id={`issues-${section.id}`} messages={sectionIssues} />}
      </div>
      {!folded &&
        (steps.length === 0 ? (
          <p className="py-3 pl-3 text-sm text-ink-500">No steps in this task yet.</p>
        ) : (
          <ol className="space-y-2 pt-2">
            {steps.map(({ item, stepIndex }) => (
              <StepCard
                key={item.id}
                item={item}
                stepLabel={stepRef(index, stepIndex)}
                issues={issues.items.get(item.id)}
                onOpenPictures={() => onOpenPictures(item.id)}
                signing={signing}
                onFlag={onFlag ? () => onFlag(item.id) : undefined}
              />
            ))}
            {signing && progress && !done && progress.steps - progress.signed > 1 && (
              <li className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={onSignTask}
                  disabled={!signing.initials}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-ink-300 bg-surface px-3 text-sm font-medium text-ink-800 transition-colors hover:border-ok-fg hover:bg-ok-bg hover:text-ok-fg disabled:opacity-50"
                >
                  <Check size={16} aria-hidden="true" />
                  Sign the whole task ({progress.steps - progress.signed} steps left)
                </button>
              </li>
            )}
          </ol>
        ))}
    </section>
  );
}

/**
 * A step's sign-off: a small field with the initials to sign with, and the button. The field
 * starts as the initials last signed with on this device (the signed-in user's at first) and can
 * be overtyped for this sign-off, as on a tablet several people share; Enter in it signs too.
 */
function SignField({
  stepRef: ref,
  itemId,
  busy,
  signing,
}: {
  stepRef: string;
  itemId: string;
  busy: boolean;
  signing: Signing;
}) {
  // What was typed here; null shows the initials the page signs with.
  const [typed, setTyped] = useState<string | null>(null);
  const text = typed ?? signing.initials;
  const initials = InitialsSchema.safeParse(text);
  const sign = () => {
    if (!initials.success || busy) return;
    signing.onSign([itemId], initials.data);
    setTyped(null);
  };
  return (
    <div className="flex items-center gap-2">
      <input
        aria-label={`Initials for step ${ref}`}
        aria-invalid={text !== '' && !initials.success ? true : undefined}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={5}
        placeholder="Initials"
        value={text}
        onChange={(event) => setTyped(event.target.value.toLocaleUpperCase('sv'))}
        onKeyDown={(event) => {
          if (event.key === 'Enter') sign();
        }}
        className="h-10 w-20 rounded-md border border-ink-500/80 bg-surface px-2 text-center text-sm font-semibold tracking-wide text-ink-900 shadow-xs placeholder:font-normal placeholder:tracking-normal placeholder:text-ink-500 hover:border-ink-600 focus-visible:border-brand-600 focus-visible:outline-1 focus-visible:outline-offset-0 aria-invalid:border-nok-fg dark:border-ink-400"
      />
      <button
        type="button"
        disabled={busy || !initials.success}
        aria-label={`Sign step ${ref} as done`}
        title={initials.success ? undefined : 'Enter your initials first'}
        onClick={sign}
        className="inline-flex h-10 items-center gap-2 rounded-md bg-ok-fg px-4 text-sm font-semibold text-white shadow-xs transition-opacity hover:opacity-90 disabled:bg-ink-200 disabled:text-ink-500 disabled:shadow-none dark:text-ink-50"
      >
        {busy ? (
          <LoaderCircle size={16} aria-hidden="true" className="animate-spin" />
        ) : (
          <Check size={16} strokeWidth={3} aria-hidden="true" />
        )}
        Sign as done
      </button>
    </div>
  );
}

function StepCard({
  item,
  stepLabel: ref,
  issues,
  onOpenPictures,
  signing,
  onFlag,
}: {
  item: Item;
  /** "1.3" */
  stepLabel: string;
  issues: string[] | undefined;
  onOpenPictures: () => void;
  signing?: Signing | undefined;
  /** Opens the form to say what is wrong with the step. */
  onFlag?: (() => void) | undefined;
}) {
  const step = item.assembly ?? {};
  const signOff = signing?.signOffs[item.id];
  const busy = signing?.pending.has(item.id) ?? false;
  const pictures = (item.guide?.images.length ?? 0) > 0;
  const description = item.guide?.description?.trim();
  const fasteners = step.fasteners ?? [];
  const documents = step.documents ?? [];
  const hasParts = Boolean(
    step.partNumbers?.length || step.assyNumber?.trim() || step.assyName?.trim(),
  );
  return (
    <li id={`row-${item.id}`} className="scroll-mt-24">
      <div
        className={clsx(
          'grid gap-x-4 gap-y-3 rounded-lg border p-3 @min-[36rem]:p-4',
          pictures && '@min-[36rem]:grid-cols-[11rem_minmax(0,1fr)]',
          issues
            ? 'border-nok-fg bg-nok-bg'
            : signOff
              ? 'border-ok-border bg-ok-bg'
              : 'border-ink-200 bg-surface',
        )}
      >
        {pictures && (
          <div className="max-w-56 self-start @min-[36rem]:max-w-none">
            <PictureTile
              guide={item.guide}
              rowRef={ref}
              onOpen={onOpenPictures}
              editable={false}
              step
            />
          </div>
        )}
        <div className="min-w-0 space-y-3">
          <div>
            <div className="flex items-start gap-2">
              <p className="flex min-w-0 flex-1 items-baseline gap-2.5">
                <span className="shrink-0 text-sm font-semibold text-brand-700 tabular-nums">
                  {ref}
                </span>
                <span className="min-w-0 text-base leading-6 font-semibold wrap-break-word text-ink-900">
                  {item.text || <span className="font-normal text-ink-500">Empty step</span>}
                </span>
              </p>
              {onFlag && (
                <button
                  type="button"
                  onClick={onFlag}
                  aria-label={`Something is wrong with step ${ref}`}
                  title="Something wrong? Tell the admins"
                  className="-mt-1 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink-100 hover:text-nok-fg pointer-coarse:size-10"
                >
                  <Flag size={15} aria-hidden="true" />
                </button>
              )}
            </div>
            <StepFacts step={step} className="mt-2" />
          </div>
          {description && (
            <p className="text-sm leading-6 wrap-break-word whitespace-pre-line text-ink-800">
              {description}
            </p>
          )}
          {(fasteners.length > 0 || hasParts) && (
            <div className="grid gap-x-8 gap-y-3 @min-[44rem]:grid-cols-2">
              {fasteners.length > 0 && <BoltList fasteners={fasteners} stepRef={ref} />}
              {hasParts && <PartList step={step} stepRef={ref} />}
            </div>
          )}
          {documents.length > 0 && <DocumentList documents={documents} />}
          {signing && (
            <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 border-t border-ink-200/70 pt-3">
              {signOff ? (
                <>
                  <p
                    className="mr-auto flex items-center gap-2 text-sm font-semibold text-ok-fg"
                    title={`Signed by ${signing.personName(signOff.by)}`}
                  >
                    <CircleCheck size={18} aria-hidden="true" className="shrink-0" />
                    <span>
                      Done · {signOff.initials}
                      <span className="ml-2 text-xs font-normal text-ink-500 tabular-nums">
                        {formatDateTime(signOff.at)}
                      </span>
                    </span>
                  </p>
                  {signing.canUnsign(signOff) && (
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Take back the sign-off of step ${ref}`}
                      onClick={() => signing.onUnsign(item.id)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900 disabled:opacity-50"
                    >
                      {busy ? (
                        <LoaderCircle size={13} aria-hidden="true" className="animate-spin" />
                      ) : (
                        <Undo2 size={13} aria-hidden="true" />
                      )}
                      Undo
                    </button>
                  )}
                </>
              ) : (
                <SignField stepRef={ref} itemId={item.id} busy={busy} signing={signing} />
              )}
            </div>
          )}
        </div>
      </div>
      {issues && <IssueNote id={`issues-${item.id}`} messages={issues} />}
    </li>
  );
}
