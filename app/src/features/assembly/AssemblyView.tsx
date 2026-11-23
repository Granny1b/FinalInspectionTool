import {
  formatMinutes,
  stepRef,
  stepsMinutes,
  totalMinutes,
  type Item,
  type Section,
} from '@modig/shared';
import clsx from 'clsx';
import { ChevronDown, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
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

type Props = {
  sections: Section[];
  issues: IssueIndex;
};

/**
 * An assembly instruction to read: its tasks, each with its steps as cards (picture, what to do,
 * instructions, bolts, parts and documents). A search box and the departments narrow it to the
 * steps someone needs; the list of tasks jumps to one. A step's picture opens its pictures large.
 */
export function AssemblyView({ sections, issues }: Props) {
  const [filter, setFilter] = useState<StepFilter>(NO_FILTER);
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const [picturesOf, setPicturesOf] = useState<string | null>(null);
  const departments = useMemo(() => departmentCounts(sections), [sections]);
  const tasks = useMemo(() => shownTasks(sections, filter), [sections, filter]);
  const filtering = isFiltering(filter);
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
              onClick={() => setFilter(NO_FILTER)}
              className="inline-flex items-center gap-1 rounded-sm font-medium text-brand-700 hover:text-brand-800"
            >
              <X size={14} aria-hidden="true" />
              Show all steps
            </button>
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-8 @min-[60rem]:grid-cols-[13rem_minmax(0,1fr)]">
        <TaskOutline tasks={tasks} sections={sections} filtering={filtering} />
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
            />
          ))}
        </div>
      </div>

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
}: {
  tasks: ShownTask[];
  sections: Section[];
  filtering: boolean;
}) {
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
      <ol className="flex flex-wrap gap-1 @min-[60rem]:block @min-[60rem]:space-y-0.5">
        {tasks.map(({ section, index, steps }) => (
          <li key={section.id}>
            <a
              href={`#section-${section.id}`}
              className="max-@min-[60rem]:border max-@min-[60rem]:border-ink-200 flex items-baseline gap-2 rounded-md px-2 py-1.5 text-sm text-ink-700 transition-colors hover:bg-ink-100 hover:text-ink-900"
            >
              <span className="w-5 shrink-0 text-right text-xs font-semibold text-ink-500 tabular-nums">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate">{section.title || 'Untitled task'}</span>
              <span className="shrink-0 text-xs text-ink-500 tabular-nums">
                {filtering ? steps.length : section.items.length}
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
}: {
  task: ShownTask;
  filtering: boolean;
  folded: boolean;
  onToggle: () => void;
  issues: IssueIndex;
  onOpenPictures: (itemId: string) => void;
}) {
  const { section, index, steps } = task;
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
              'flex min-h-12 w-full items-center gap-3 rounded-md border border-ink-200 px-3 py-2 text-left transition-colors enabled:hover:border-ink-300',
              sectionIssues ? 'bg-inherit' : 'bg-ink-50',
            )}
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white tabular-nums">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 text-base font-semibold wrap-break-word text-ink-900">
              {section.title || <span className="font-normal text-ink-500">Untitled task</span>}
            </span>
            <span className="shrink-0 text-xs text-ink-500 tabular-nums">
              {filtering
                ? `${steps.length} of ${section.items.length}`
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
              />
            ))}
          </ol>
        ))}
    </section>
  );
}

function StepCard({
  item,
  stepLabel: ref,
  issues,
  onOpenPictures,
}: {
  item: Item;
  /** "1.3" */
  stepLabel: string;
  issues: string[] | undefined;
  onOpenPictures: () => void;
}) {
  const step = item.assembly ?? {};
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
          issues ? 'border-nok-fg bg-nok-bg' : 'border-ink-200 bg-surface',
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
            <p className="flex items-baseline gap-2.5">
              <span className="shrink-0 text-sm font-semibold text-brand-700 tabular-nums">
                {ref}
              </span>
              <span className="min-w-0 text-base leading-6 font-semibold wrap-break-word text-ink-900">
                {item.text || <span className="font-normal text-ink-500">Empty step</span>}
              </span>
            </p>
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
        </div>
      </div>
      {issues && <IssueNote id={`issues-${item.id}`} messages={issues} />}
    </li>
  );
}
