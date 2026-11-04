import { useId, type ReactNode } from 'react';

type SettingsCardProps = {
  title: string;
  description: string;
  children: ReactNode;
};

/**
 * One card on the Settings page: a title, one line on what it is for, and the body. The header
 * is the app's card header (Insights, the front page, the revision history), so Settings reads
 * as the same product: no icon tile, a small title over a divider.
 */
export function SettingsCard({ title, description, children }: SettingsCardProps) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="rounded-lg border border-ink-200 bg-surface">
      {/* Narrower sides on a phone, where the lists' fields need every pixel; the header keeps
          to the body's edge. The Save bar in SettingsForm reaches out to the body's edges: keep
          the two in step. */}
      <div className="border-b border-ink-200 px-4 py-3.5 sm:px-5">
        <h2 id={titleId} className="text-sm font-semibold text-ink-900">
          {title}
        </h2>
        <p className="mt-0.5 text-xs text-ink-500">{description}</p>
      </div>
      <div className="px-4 py-5 sm:px-5">{children}</div>
    </section>
  );
}
