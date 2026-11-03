import { useState } from 'react';
import { formatCount } from './format';

export type BarItem = {
  key: string;
  label: string;
  /** Shown after the label in muted text, e.g. "(no longer in use)". */
  note?: string;
  value: number;
};

type Props = {
  items: BarItem[];
  /** Rows shown before "Show all"; every row when omitted. */
  limit?: number;
};

/**
 * Ranked horizontal bars (sections, models, resps): the label and the value on a line, the bar
 * under them. Long labels wrap instead of being cut off, and every value is printed, so nothing
 * hides in a tooltip. One hue: the bars are counts of one thing, the rank is in their length.
 */
export function BarList({ items, limit }: Props) {
  const [expanded, setExpanded] = useState(false);
  const max = Math.max(1, ...items.map((item) => item.value));
  const shown = limit && !expanded ? items.slice(0, limit) : items;
  return (
    <div>
      <ul className="space-y-3">
        {shown.map((item) => (
          <li key={item.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 wrap-break-word text-ink-800">
                {item.label}
                {item.note && <span className="ml-1.5 text-xs text-ink-500">{item.note}</span>}
              </span>
              <span className="shrink-0 font-medium text-ink-900 tabular-nums">
                {formatCount(item.value)}
              </span>
            </div>
            {/* Square at the baseline, rounded at the end that carries the value. */}
            <div className="mt-1.5 h-2" aria-hidden="true">
              <div
                className="h-full rounded-r-sm bg-brand-600"
                style={{ width: `${(item.value / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      {limit !== undefined && items.length > limit && (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          className="mt-4 rounded-sm text-sm font-medium text-brand-700 underline-offset-2 hover:underline"
        >
          {expanded ? 'Show fewer' : `Show all ${items.length}`}
        </button>
      )}
    </div>
  );
}
