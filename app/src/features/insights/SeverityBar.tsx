import { SEVERITIES, SEVERITY_LABELS, type Insights, type Severity } from '@modig/shared';
import clsx from 'clsx';
import { formatCount, formatPercent } from './format';

/**
 * The severity tokens (index.css), the same as the badges on a deviation card: minor a neutral
 * grey, major red, critical the strongest red (on the dark card, the lightest). Each fill has its
 * own label colour, at 4.5:1 in both themes.
 */
const FILL: Record<Severity, string> = {
  minor: 'bg-severity-minor text-on-severity-minor',
  major: 'bg-severity-major text-on-severity-major',
  critical: 'bg-severity-critical text-on-severity-critical',
};

/**
 * Deviations by severity (brief §5.5 "stacked bar"): the selection as one bar split into minor,
 * major and critical, each block labelled with its share, and a legend with the counts.
 */
export function SeverityBar({ bySeverity }: { bySeverity: Insights['bySeverity'] }) {
  const total = SEVERITIES.reduce((sum, severity) => sum + bySeverity[severity], 0);
  const parts = SEVERITIES.map((severity) => ({
    severity,
    count: bySeverity[severity],
    share: total ? bySeverity[severity] / total : 0,
  }));
  const summary = parts
    .map((part) => `${SEVERITY_LABELS[part.severity]} ${formatCount(part.count)}`)
    .join(', ');
  return (
    <div>
      <div
        role="img"
        aria-label={`Deviations by severity: ${summary}`}
        className="flex h-7 gap-0.5"
      >
        {parts
          .filter((part) => part.count > 0)
          .map((part) => (
            <div
              key={part.severity}
              title={`${SEVERITY_LABELS[part.severity]}: ${formatCount(part.count)} (${formatPercent(part.share)})`}
              className={clsx(
                // Each block is a container, so its label shows only when the block is wide
                // enough for it, whatever the card's width; the legend still gives the count.
                '@container flex min-w-0 items-center rounded-sm px-2 text-xs font-semibold',
                FILL[part.severity],
              )}
              style={{ flexGrow: part.count, flexBasis: 0 }}
            >
              <span className="@max-[1.75rem]:hidden">{formatPercent(part.share)}</span>
            </div>
          ))}
      </div>
      <ul className="mt-4 space-y-2 text-sm">
        {parts.map((part) => (
          <li key={part.severity} className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className={clsx('size-2.5 shrink-0 rounded-xs', FILL[part.severity])}
            />
            <span className="text-ink-700">{SEVERITY_LABELS[part.severity]}</span>
            <span className="ml-auto font-medium text-ink-900 tabular-nums">
              {formatCount(part.count)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
