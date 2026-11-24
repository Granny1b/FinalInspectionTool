import { formatMinutes, type TemplateSummary } from '@modig/shared';
import { Link } from 'react-router';
import { buttonClasses } from '../../components/buttonClasses';
import { formatDate } from '../../lib/format';
import { usePersonName } from '../../lib/usePeople';
import { Badge, PublishedBadge } from '../templates/Badge';

/** How many tasks a card names before "+3 more". */
const TASKS_SHOWN = 8;

/**
 * An assembly instruction as a card: its name, tasks, size and time. `href` is where it opens:
 * where it is read, or its editor under its machine template.
 */
export function InstructionCard({
  instruction,
  isAdmin,
  href,
}: {
  instruction: TemplateSummary;
  /** Admins also see which drafts have unpublished changes. */
  isAdmin: boolean;
  href: string;
}) {
  const personName = usePersonName();
  const tasks = instruction.sectionTitles ?? [];
  const more = tasks.length - TASKS_SHOWN;
  return (
    // The title's link covers the card; the outline shows where keyboard focus is.
    <li className="relative flex flex-col gap-4 rounded-lg border border-ink-200 bg-surface p-5 shadow-xs outline-brand-600 transition-colors hover:border-ink-300 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <h3 className="min-w-0 text-base font-semibold wrap-break-word text-ink-900">
          <Link to={href} className="outline-none after:absolute after:inset-0">
            {instruction.name || 'Untitled assembly instruction'}
          </Link>
        </h3>
        <div className="flex flex-wrap gap-1.5">
          <PublishedBadge revision={instruction.publishedRevision} />
          {isAdmin &&
            instruction.hasUnpublishedChanges &&
            instruction.publishedRevision !== null && (
              <Badge tone="brand">Unpublished changes</Badge>
            )}
        </div>
      </div>

      {tasks.length > 0 ? (
        <ol aria-label="Tasks" className="flex flex-wrap gap-1.5">
          {tasks.slice(0, TASKS_SHOWN).map((title, index) => (
            <li
              key={index}
              className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-md bg-ink-100 px-2.5 text-sm text-ink-800"
            >
              <span className="font-semibold tabular-nums">{index + 1}</span>
              <span className="truncate">{title || 'Untitled task'}</span>
            </li>
          ))}
          {more > 0 && (
            <li className="inline-flex h-7 items-center px-1 text-sm text-ink-500">+{more} more</li>
          )}
        </ol>
      ) : (
        <p className="text-sm text-ink-500">No tasks yet.</p>
      )}

      <div className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t border-ink-100 pt-3">
        <dl className="grid grid-cols-4 gap-x-6 text-xs">
          <Stat label="Tasks" value={String(tasks.length)} />
          <Stat label="Steps" value={String(instruction.itemCount)} />
          <Stat label="Time" value={formatMinutes(instruction.totalMinutes ?? 0)} />
          <Stat
            label="Last edited"
            value={formatDate(instruction.updatedAt)}
            title={personName(instruction.updatedBy)}
          />
        </dl>
        {/* The card is the link; this only shows it, so it is no second stop. */}
        <span aria-hidden="true" className={buttonClasses('secondary', 'h-8')}>
          Open
        </span>
      </div>
    </li>
  );
}

function Stat({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div>
      <dt className="text-ink-500">{label}</dt>
      <dd
        className="mt-0.5 text-sm font-semibold whitespace-nowrap text-ink-900 tabular-nums"
        title={title}
      >
        {value}
      </dd>
    </div>
  );
}
