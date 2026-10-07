import type { InspectionProgress } from '@modig/shared';
import clsx from 'clsx';
import { ArrowDown } from 'lucide-react';
import { memo, useRef, type KeyboardEvent } from 'react';
import { panelId, tabId, type InspectionTab } from './issues';

const TABS: { tab: InspectionTab; label: string }[] = [
  { tab: 'checklist', label: 'Checklist' },
  { tab: 'deviations', label: 'Deviations' },
];

type TabBarProps = {
  idPrefix: string;
  selected: InspectionTab;
  /** Shown next to "Deviations"; it follows every NOK as it is marked. */
  deviationCount: number;
  onSelect: (tab: InspectionTab) => void;
};

/** "Checklist | Deviations (n)", as ARIA tabs: arrow keys switch, Tab moves on into the page. */
export const TabBar = memo(function TabBar({
  idPrefix,
  selected,
  deviationCount,
  onSelect,
}: TabBarProps) {
  const listRef = useRef<HTMLDivElement>(null);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex(({ tab }) => tab === selected);
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % TABS.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + TABS.length) % TABS.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? TABS.length - 1
              : null;
    const target = next === null ? undefined : TABS[next];
    if (!target) return;
    event.preventDefault();
    onSelect(target.tab);
    listRef.current?.querySelector<HTMLElement>(`[id="${tabId(idPrefix, target.tab)}"]`)?.focus();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Inspection"
      onKeyDown={onKeyDown}
      className="-mb-px flex gap-6"
    >
      {TABS.map(({ tab, label }) => {
        const active = tab === selected;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            id={tabId(idPrefix, tab)}
            aria-selected={active}
            aria-controls={panelId(idPrefix, tab)}
            // One stop for the tab list; the arrow keys move within it.
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(tab)}
            className={clsx(
              'inline-flex h-10 items-center gap-2 border-b-2 px-0.5 text-sm font-medium transition-colors',
              active
                ? 'border-brand-600 text-ink-900'
                : 'border-transparent text-ink-500 hover:border-ink-300 hover:text-ink-900',
            )}
          >
            {label}
            {tab === 'deviations' && (
              <span
                className={clsx(
                  'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums',
                  deviationCount > 0 ? 'bg-nok-bg text-nok-fg' : 'bg-ink-100 text-ink-600',
                )}
              >
                {deviationCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
});

type ProgressProps = InspectionProgress & {
  /** The first row without a status, if any; "Continue at 3.b" focuses it. */
  nextEmpty: { itemId: string; ref: string } | null;
  onContinue: (itemId: string) => void;
  /** The Continue button's id: the page focuses it on open. */
  continueId?: string;
};

/**
 * "87 / 104 rows filled · 6 NOK" (brief §5.3) with a bar, and a way back to where you left off.
 * Memoised on its numbers: typing a comment changes none of them.
 */
export const ProgressSummary = memo(function ProgressSummary({
  total,
  filled,
  nok,
  nextEmpty,
  onContinue,
  continueId,
}: ProgressProps) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 pb-2.5 text-sm">
      {nextEmpty && (
        <button
          id={continueId}
          type="button"
          onClick={() => onContinue(nextEmpty.itemId)}
          className="inline-flex items-center gap-1 rounded-sm font-medium text-brand-700 underline-offset-2 hover:underline"
        >
          <ArrowDown size={14} aria-hidden="true" />
          Continue at {nextEmpty.ref}
        </button>
      )}
      <div className="flex items-center gap-2.5">
        <div aria-hidden="true" className="h-1.5 w-24 overflow-hidden rounded-full bg-ink-200">
          <div
            className={clsx(
              'h-full rounded-full transition-[width]',
              filled === total ? 'bg-ok-fg' : 'bg-brand-600',
            )}
            style={{ width: `${total > 0 ? (filled / total) * 100 : 0}%` }}
          />
        </div>
        <p className="text-ink-600 tabular-nums">
          {filled} / {total} rows filled ·{' '}
          <span className={nok > 0 ? 'font-semibold text-nok-fg' : undefined}>{nok} NOK</span>
        </p>
      </div>
    </div>
  );
});
