import clsx from 'clsx';
import { Info } from 'lucide-react';

/**
 * A row's more information on its card, two lines at most; all of it is in the row's pictures
 * dialog.
 */
export function MoreInformation({ text, className }: { text: string; className?: string }) {
  return (
    <p className={clsx('flex items-start gap-1.5 text-xs leading-5 text-ink-600', className)}>
      <Info size={13} aria-hidden="true" className="mt-1 shrink-0 text-ink-500" />
      <span className="line-clamp-2 min-w-0 whitespace-pre-line">
        <span className="sr-only">More information: </span>
        {text}
      </span>
    </p>
  );
}
