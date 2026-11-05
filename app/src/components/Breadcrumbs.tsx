import { ChevronRight } from 'lucide-react';
import { Fragment } from 'react';
import { Link } from 'react-router';

/**
 * "Templates › RigiMill MG › Quality checks" above a page's title: the way back, a step at a time.
 * On touch screens the hit area grows by 8 px above and below without moving anything.
 */
export function Breadcrumbs({ items }: { items: { to: string; label: string }[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-sm text-ink-500">
        {items.map(({ to, label }, index) => (
          <Fragment key={to}>
            {index > 0 && (
              <li aria-hidden="true" className="flex">
                <ChevronRight size={14} className="text-ink-400" />
              </li>
            )}
            <li className="min-w-0">
              <Link
                to={to}
                className="block truncate rounded-sm transition-colors hover:text-ink-900 pointer-coarse:-my-2 pointer-coarse:py-2"
              >
                {label}
              </Link>
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
