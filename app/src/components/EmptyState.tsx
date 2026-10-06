import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type Props = {
  icon: LucideIcon;
  title: string;
  /** One line telling the user what will appear here, or what to do. */
  hint: string;
  action?: ReactNode;
};

export function EmptyState({ icon: Icon, title, hint, action }: Props) {
  return (
    <section className="rounded-lg border border-ink-200 bg-surface px-6 py-16 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
        <Icon size={22} strokeWidth={1.75} />
      </div>
      <h2 className="mt-5 text-base font-semibold text-ink-900">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-balance text-ink-500">{hint}</p>
      {action && <div className="mt-7 flex justify-center">{action}</div>}
    </section>
  );
}
