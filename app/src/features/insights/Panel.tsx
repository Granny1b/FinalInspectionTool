import clsx from 'clsx';
import { useId, type ReactNode } from 'react';

type Props = {
  title: string;
  /** One line under the title: what is counted. */
  description?: string;
  /** Next to the title, e.g. a total. */
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
};

/**
 * A card on the Insights page: one chart or table under a heading. The header is the app's card
 * header (Settings, the front page, the revision history): a small title, one line under it, and
 * a divider.
 */
export function Panel({ title, description, aside, className, children }: Props) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={clsx(
        'flex min-w-0 flex-col rounded-lg border border-ink-200 bg-surface',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-ink-200 px-5 py-3.5">
        <div className="min-w-0">
          <h2 id={titleId} className="text-sm font-semibold text-ink-900">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-xs text-ink-500">{description}</p>}
        </div>
        {/* Its smaller line centred on the title's. */}
        {aside && <div className="shrink-0 pt-0.5 text-xs text-ink-500">{aside}</div>}
      </div>
      <div className="flex-1 p-5">{children}</div>
    </section>
  );
}

/** What a panel shows when its slice of the data is empty. */
export function PanelEmpty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-ink-500">{children}</p>;
}
