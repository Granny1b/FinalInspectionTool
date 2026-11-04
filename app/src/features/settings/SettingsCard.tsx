import type { LucideIcon } from 'lucide-react';
import { useId, type ReactNode } from 'react';

type SettingsCardProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  children: ReactNode;
};

/** One card on the Settings page: an icon, a title, one line on what it is for, and the body. */
export function SettingsCard({ icon: Icon, title, description, children }: SettingsCardProps) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="rounded-lg border border-ink-200 bg-surface">
      <div className="flex items-start gap-4 border-b border-ink-100 px-6 py-5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-brand-100">
          <Icon size={18} strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-semibold text-ink-900">
            {title}
          </h2>
          <p className="mt-0.5 text-sm text-ink-500">{description}</p>
        </div>
      </div>
      <div className="px-6 py-6">{children}</div>
    </section>
  );
}
