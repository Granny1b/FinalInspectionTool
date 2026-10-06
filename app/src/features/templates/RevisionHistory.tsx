import type { TemplateRevisionInfo } from '@modig/shared';
import { ChevronRight } from 'lucide-react';
import { memo, useId } from 'react';
import { Link } from 'react-router';
import { formatDateTime } from '../../lib/format';
import { Badge } from './Badge';

type Props = {
  templateId: string;
  /** Newest first. */
  revisions: TemplateRevisionInfo[];
};

/**
 * Revision, date, who and note for every published revision (brief §5.2), newest first.
 * Memoised: the editor re-renders on every keystroke, the history only on publish.
 */
export const RevisionHistory = memo(function RevisionHistory({ templateId, revisions }: Props) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col rounded-lg border border-ink-200 bg-surface"
    >
      <h2
        id={titleId}
        className="border-b border-ink-100 px-5 py-3.5 text-sm font-semibold text-ink-900"
      >
        Revision history
      </h2>
      {revisions.length === 0 ? (
        <p className="px-5 py-5 text-sm text-ink-500">
          Not published yet. Publishing creates revision 1, which new inspections then use.
        </p>
      ) : (
        <ol className="max-h-[26rem] divide-y divide-ink-100 overflow-y-auto">
          {revisions.map((revision, index) => (
            <li key={revision.revision} className="group relative px-5 py-3 hover:bg-ink-50">
              <div className="flex items-center gap-2">
                <Link
                  to={`/templates/${templateId}/revisions/${revision.revision}`}
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
                {formatDateTime(revision.publishedAt)} · {revision.publishedBy}
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
