import type { InspectionKind, MachineCheck } from '@modig/shared';
import clsx from 'clsx';
import {
  ArrowUpCircle,
  ClipboardCheck,
  ListChecks,
  LoaderCircle,
  Pencil,
  Play,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { memo, useId } from 'react';
import { Link, useNavigate } from 'react-router';
import { ActionMenu } from '../../components/ActionMenu';
import { Button, ButtonLink } from '../../components/Button';
import { deviationsTabHref } from '../deviationLog/model';
import { inspectionHref } from '../inspections/listFilter';
import { StateBadge } from '../inspections/StateBadge';
import { basedOnText, checklistHref, checkTitle, updateAvailable, updateText } from './model';

type Props = {
  checks: readonly MachineCheck[];
  /** Admins edit a check's checklist, update it, and remove or delete it. */
  isAdmin: boolean;
  /** The check being started, if any. */
  starting: string | null;
  /** The next check to do on the machine (nextCheck): its Start stands out. */
  nextId?: string | null;
  onStart: (check: MachineCheck) => void;
  onUpdate: (check: MachineCheck) => void;
  /** Remove a check not started from the machine, or delete one started (the page asks first). */
  onRemove: (check: MachineCheck) => void;
  /**
   * The machine's page (the default): admins also see an available update and each check's
   * ⋯ menu (Edit checklist, Remove). False where only starting and opening belong.
   */
  manage?: boolean;
};

/**
 * A machine's checks of one kind, in the order they are done, each a card: what it is and where
 * its copy came from, its state and deviations, and what can be done with it (Start, or Open; an
 * update when its template has a newer revision).
 */
export const CheckCards = memo(function CheckCards({
  checks,
  isAdmin,
  starting,
  onStart,
  onUpdate,
  onRemove,
  nextId = null,
  manage = true,
}: Props) {
  return (
    <ul className="space-y-2">
      {checks.map((check, index) => (
        <CheckCard
          key={check.id}
          check={check}
          position={check.kind === 'quality' ? index + 1 : null}
          isAdmin={isAdmin && manage}
          starting={starting === check.id}
          next={nextId === check.id}
          busy={starting !== null}
          onStart={onStart}
          onUpdate={onUpdate}
          onRemove={onRemove}
        />
      ))}
    </ul>
  );
});

type CardProps = Omit<Props, 'checks' | 'starting' | 'manage' | 'nextId'> & {
  check: MachineCheck;
  /** A quality check's place in the order they are done (1, 2…); null for the final inspection. */
  position: number | null;
  starting: boolean;
  /** The next check to do on the machine. */
  next: boolean;
  /** A start is on its way: no second one. */
  busy: boolean;
};

function CheckCard({
  check,
  position,
  isAdmin,
  starting,
  next,
  busy,
  onStart,
  onUpdate,
  onRemove,
}: CardProps) {
  const navigate = useNavigate();
  const titleId = useId();
  const title = checkTitle(check);
  const href = inspectionHref(check.kind, check.id);
  const notStarted = check.state === 'not_started';
  const update = isAdmin && updateAvailable(check);
  const Icon = check.kind === 'final' ? ClipboardCheck : ShieldCheck;
  const { open, closed } = check.deviations;
  const menu = isAdmin
    ? [
        ...(check.state !== 'finalised'
          ? [
              {
                label: 'Edit checklist',
                icon: Pencil,
                onSelect: () => void navigate(checklistHref(check.kind, check.id)),
              },
            ]
          : []),
        // Not started: off the machine (Add check brings it back). Started: deleted with what was
        // recorded on it, after asking.
        {
          label: notStarted
            ? 'Remove from machine'
            : check.kind === 'quality'
              ? 'Delete quality check'
              : 'Delete final inspection',
          icon: Trash2,
          danger: true,
          onSelect: () => onRemove(check),
        },
      ]
    : [];

  return (
    <li
      aria-labelledby={titleId}
      className="@container rounded-lg border border-ink-200 bg-surface px-4 py-3.5 sm:px-5"
    >
      {/* Laid out by the card's width: the actions beside the text from 36rem, under it (in the
          text's column) on a phone. */}
      <div className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-4 gap-y-3 @min-[36rem]:grid-cols-[2rem_minmax(0,1fr)_auto]">
        <span
          aria-hidden="true"
          className={clsx(
            'mt-0.5 flex size-8 items-center justify-center rounded-md text-xs font-semibold tabular-nums',
            check.state === 'finalised'
              ? 'bg-ok-bg text-ok-fg'
              : notStarted
                ? 'bg-ink-100 text-ink-600'
                : 'bg-brand-50 text-brand-700',
          )}
        >
          {position ?? <Icon size={16} strokeWidth={1.75} />}
        </span>
        <div className="min-w-0">
          <h3 id={titleId} className="text-[0.9375rem] font-semibold wrap-break-word text-ink-900">
            <Link to={href} className="hover:underline">
              {title}
            </Link>
          </h3>
          {/* Spaced, not separated by dots: on a narrow card a dot would dangle at a line end. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-600">
            <StateBadge state={check.state} />
            {!notStarted && <span className="font-medium text-ink-800">{check.number}</span>}
            {check.state === 'in_progress' && (
              <Progress filled={check.filled} total={check.total} />
            )}
            {!notStarted && (
              <span className="tabular-nums">
                {open + closed === 0 ? (
                  'No deviations'
                ) : (
                  <Link
                    to={deviationsTabHref(check.kind, check.id)}
                    className="text-brand-700 underline-offset-2 hover:underline"
                  >
                    <span className={clsx(open > 0 && 'font-semibold text-nok-fg')}>
                      {open} open
                    </span>{' '}
                    · {closed} closed
                  </Link>
                )}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-xs text-ink-500">{basedOnText(check)}</p>
        </div>
        <div className="col-start-2 flex items-center gap-2 @min-[36rem]:col-start-3 @min-[36rem]:row-start-1">
          {notStarted ? (
            // The next one to do stands out; the others are there to start out of turn.
            <Button
              variant={next ? 'primary' : 'secondary'}
              onClick={() => onStart(check)}
              disabled={busy}
            >
              {starting ? (
                <LoaderCircle size={16} aria-hidden="true" className="animate-spin" />
              ) : (
                <Play size={16} aria-hidden="true" />
              )}
              {starting ? 'Starting…' : 'Start'}
              <span className="sr-only"> {title}</span>
            </Button>
          ) : (
            <ButtonLink to={href} variant="secondary">
              Open<span className="sr-only"> {title}</span>
            </ButtonLink>
          )}
          {menu.length > 0 && <ActionMenu label={`${title} actions`} items={menu} />}
        </div>
      </div>
      {update && (
        <div className="mt-3 ml-12 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-brand-50 px-3 py-2 ring-1 ring-brand-200 ring-inset">
          <ArrowUpCircle size={16} aria-hidden="true" className="shrink-0 text-brand-700" />
          <p className="min-w-0 flex-1 text-sm text-ink-800">{updateText(check)}</p>
          <Button variant="secondary" className="h-8" onClick={() => onUpdate(check)}>
            Update…<span className="sr-only"> {title}</span>
          </Button>
        </div>
      )}
    </li>
  );
}

/** "12 / 20 rows" with a short bar. */
function Progress({ filled, total }: { filled: number; total: number }) {
  return (
    <span className="inline-flex items-center gap-2 tabular-nums">
      <span aria-hidden="true" className="h-1.5 w-14 overflow-hidden rounded-full bg-ink-200">
        <span
          className="block h-full rounded-full bg-brand-600"
          style={{ width: `${total > 0 ? (filled / total) * 100 : 0}%` }}
        />
      </span>
      {filled} / {total} rows
    </span>
  );
}

type SectionProps = Omit<Props, 'checks'> & {
  kind: InspectionKind;
  checks: readonly MachineCheck[];
  /** What to say without any. */
  empty: string;
};

/** "Quality checks (5)" over their cards; "Final inspection" over its card. */
export function CheckSection({ kind, checks, empty, ...props }: SectionProps) {
  const titleId = useId();
  const ofKind = checks.filter((check) => check.kind === kind);
  return (
    <section aria-labelledby={titleId}>
      <h2
        id={titleId}
        className="mb-3 flex items-center gap-2 text-base font-semibold text-ink-900"
      >
        {kind === 'quality' ? (
          <>
            Quality checks
            <span className="text-sm font-normal text-ink-500 tabular-nums">
              {ofKind.filter((check) => check.state === 'finalised').length} / {ofKind.length}{' '}
              finalised
            </span>
          </>
        ) : (
          'Final inspection'
        )}
      </h2>
      {ofKind.length > 0 ? (
        <CheckCards checks={ofKind} {...props} />
      ) : (
        <p className="flex items-center gap-2 rounded-lg border border-dashed border-ink-300 px-4 py-3.5 text-sm text-ink-500">
          <ListChecks size={16} aria-hidden="true" className="shrink-0 text-ink-400" />
          {empty}
        </p>
      )}
    </section>
  );
}
