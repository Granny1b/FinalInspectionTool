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
    // One quiet card rather than three boxes and a row of chips: the numbers side by side, and
    // under a hairline who the open ones are for.
    <div className="rounded-lg border border-ink-200 bg-surface">
      <dl className="grid grid-cols-1 divide-y divide-ink-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
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
        />
      </dl>
      {summary.openByResp.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-ink-100 px-5 py-3">
          <p id={chipsId} className="text-xs text-ink-500">
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
                      'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors pointer-coarse:h-9',
                      pressed
                        ? 'bg-brand-600 text-white'
                        : 'bg-ink-100 text-ink-700 hover:bg-ink-200',
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
}: {
  label: string;
  value: number;
  detail: ReactNode;
  /** Something to act on: the number in red. */
  alert?: boolean;
}) {
  return (
    // The number, with its label and a line of detail beside it.
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 px-5 py-4">
      <dt className="col-start-2 row-start-1 text-sm font-medium text-ink-700">{label}</dt>
      <dd
        className={clsx(
          'col-start-1 row-span-2 row-start-1 min-w-10 text-3xl font-semibold tracking-tight tabular-nums',
          alert ? 'text-nok-fg' : value === 0 ? 'text-ink-400' : 'text-ink-900',
        )}
      >
        {value}
      </dd>
      <dd className="col-start-2 row-start-2 text-xs text-ink-500">{detail}</dd>
    </div>
  );
}
