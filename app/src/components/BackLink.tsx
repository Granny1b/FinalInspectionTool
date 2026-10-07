import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';

/** "← Inspections" above a page's title: back to the list it belongs to. */
export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 rounded-sm text-sm text-ink-500 transition-colors hover:text-ink-900"
    >
      <ArrowLeft size={15} aria-hidden="true" />
      {label}
    </Link>
  );
}
