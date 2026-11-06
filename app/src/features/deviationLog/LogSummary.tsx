import { OVERDUE_DAYS } from '@modig/shared';
import clsx from 'clsx';
import { useId, type ReactNode } from 'react';
import { respValue, type LogSummary as Summary } from './model';

type Props = {
  summary: Summary;
  /** The responsible filter's value, if one is picked. */
  resp: string | undefined;
  /** Picks a responsible (its chip again: all of them). */
  onResp: (resp: string | undefined) => void;
};

/**
 * Open, closed and open for more than 30 days, under the filters other than the status; then the
 * open ones per responsible as chips that pick one, so "what is still open for Electrical" is
 * one click.
 */
export function LogSummary({ summary, resp, onResp }: Props) {
  const total = summary.open + summary.closed;
  const chipsId = useId();
  return (
    <div className="space-y-4">
      {/* Each tile spans three rows of the grid (label, value, detail), as Insights' tiles. */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-6">
        <Tile
          label="Open"
          value={summary.open}
          detail={
            summary.oldestOpen ? (
              <>
                Oldest found{' '}
                <span className="whitespace-nowrap tabular-nums">{summary.oldestOpen}</span>
              </>
            ) : summary.closed > 0 ? (
              'All of them closed'
            ) : (
              'No deviations'
            )
          }
        />
        <Tile
          label="Closed"
          value={summary.closed}
          detail={
            total > 0
              ? `${Math.round((summary.closed / total) * 100)}% of ${total} deviations`
              : 'No deviations'
          }
        />
        <Tile
          label={`Open more than ${OVERDUE_DAYS} days`}
          value={summary.overdue}
          detail={summary.overdue > 0 ? 'Found over a month ago' : 'None waiting that long'}
          alert={summary.overdue > 0}
          className="col-span-2 sm:col-span-1"
        />
      </dl>
      {summary.openByResp.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p id={chipsId} className="text-xs font-medium text-ink-500">
            Open by responsible
          </p>
          <ul aria-labelledby={chipsId} className="flex flex-wrap gap-1.5">
            {summary.openByResp.map((entry) => {
              const value = respValue(entry.resp);
              const pressed = resp?.toLocaleLowerCase('sv') === value.toLocaleLowerCase('sv');
              return (
                <li key={value}>
                  <button
                    type="button"
                    aria-pressed={pressed}
                    onClick={() => onResp(pressed ? undefined : value)}
                    className={clsx(
                      'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ring-1 transition-colors ring-inset pointer-coarse:h-9',
                      pressed
                        ? 'bg-brand-600 text-white ring-brand-600'
                        : 'bg-surface text-ink-700 ring-ink-200 hover:bg-ink-50 hover:ring-ink-300',
                    )}
                  >
                    {entry.resp || 'Not assigned'}
                    <span
                      className={clsx(
                        'tabular-nums',
                        pressed ? 'text-white' : 'font-semibold text-ink-900',
                      )}
                    >
                      {entry.open}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  detail,
  alert = false,
  className,
}: {
  label: string;
  value: number;
  detail: ReactNode;
  /** Something to act on: the number in red. */
  alert?: boolean;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        'row-span-3 grid grid-rows-subgrid gap-y-0 rounded-lg border bg-surface px-4 py-3 sm:px-5 sm:py-4',
        alert ? 'border-nok-border' : 'border-ink-200',
        className,
      )}
    >
      <dt className="text-sm text-ink-500">{label}</dt>
      <dd
        className={clsx(
          'mt-1.5 text-2xl font-semibold tracking-tight sm:text-3xl',
          alert ? 'text-nok-fg' : 'text-ink-900',
        )}
      >
        {value}
      </dd>
      <dd className="mt-1 text-xs text-ink-500">{detail}</dd>
    </div>
  );
}
