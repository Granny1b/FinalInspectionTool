import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';

/**
 * "← Inspections" above a page's title: back to the list it belongs to. On touch screens the hit
 * area grows by 8 px above and below without moving anything.
 */
export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 rounded-sm text-sm text-ink-500 transition-colors hover:text-ink-900 pointer-coarse:-my-2 pointer-coarse:py-2"
    >
      <ArrowLeft size={15} aria-hidden="true" />
      {label}
    </Link>
  );
}
