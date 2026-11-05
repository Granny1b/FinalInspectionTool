import type { TemplateRevisionInfo } from '@modig/shared';
import { ChevronRight } from 'lucide-react';
import { memo, useId } from 'react';
import { Link } from 'react-router';
import { formatDateTime } from '../../lib/format';
import { usePersonName } from '../../lib/usePeople';
import { Badge } from './Badge';

type Props = {
  /** The template's address; a revision is `{basePath}/revisions/{n}`. */
  basePath: string;
  /** Newest first. */
  revisions: TemplateRevisionInfo[];
  /** Said while nothing is published. */
  emptyText: string;
};

/**
 * Revision, date, who and note for every published revision (brief §5.2), newest first.
 * Memoised: the editor re-renders on every keystroke, the history only on publish.
 */
export const RevisionHistory = memo(function RevisionHistory({
  basePath,
  revisions,
  emptyText,
}: Props) {
  const titleId = useId();
  const personName = usePersonName();
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col rounded-lg border border-ink-200 bg-surface"
    >
      {/* The app's card header, as on the front page beside it. */}
      <div className="flex items-start justify-between gap-4 border-b border-ink-200 px-5 py-3.5">
        <h2 id={titleId} className="text-sm font-semibold text-ink-900">
          Revision history
        </h2>
      </div>
      {revisions.length === 0 ? (
        <p className="px-5 py-5 text-sm text-ink-500">{emptyText}</p>
      ) : (
        <ol className="max-h-[26rem] divide-y divide-ink-100 overflow-y-auto">
          {revisions.map((revision, index) => (
            <li key={revision.revision} className="group relative px-5 py-3 hover:bg-ink-50">
              <div className="flex items-center gap-2">
                <Link
                  to={`${basePath}/revisions/${revision.revision}`}
                  className="text-sm font-semibold text-ink-900 outline-none after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-brand-600"
                >
                  Rev {revision.revision}
                </Link>
                {index === 0 && <Badge tone="ok">Latest</Badge>}
                <span className="ml-auto inline-flex items-center gap-0.5 text-xs font-medium text-ink-500 group-hover:text-ink-900">
                  View
                  <ChevronRight size={14} aria-hidden="true" />
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-ink-500" title={revision.publishedBy}>
                {formatDateTime(revision.publishedAt)} · {personName(revision.publishedBy)}
              </p>
              {revision.changeNote && (
                <p className="mt-1.5 line-clamp-3 text-sm whitespace-pre-line text-ink-700">
                  {revision.changeNote}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
});
