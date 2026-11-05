import { formatHours, sectionNumber, type TemplateSummary } from '@modig/shared';
import { Plus } from 'lucide-react';
import { Link } from 'react-router';
import { buttonClasses } from '../../components/buttonClasses';
import { formatDate } from '../../lib/format';
import { usePersonName } from '../../lib/usePeople';
import { Badge, PublishedBadge } from '../templates/Badge';
import { qualityCheckHref } from '../templates/queries';

type Props = {
  checks: TemplateSummary[];
  /** Admins also see which drafts have unpublished changes, and the New quality check card. */
  isAdmin: boolean;
  onNew: () => void;
};

/**
 * A machine's quality checks as cards: the title ("QC4 · Pre start up"), who owns and wrote it,
 * its revision, its sections, and its rows, time and last edit. The whole card opens it. Admins
 * get a dashed card for another one at the end.
 */
export function QualityCheckCards({ checks, isAdmin, onNew }: Props) {
  const personName = usePersonName();
  return (
    <ul className="grid gap-4 lg:grid-cols-2">
      {checks.map((check) => {
        const front = check.quality;
        const meta = [
          front?.department,
          front?.documentNumber && `document ${front.documentNumber}`,
          front?.madeBy && `made by ${front.madeBy}`,
        ].filter(Boolean);
        const sections = check.sectionTitles ?? [];
        return (
          <li
            key={check.id}
            // The title's link covers the card; the outline shows where keyboard focus is.
            className="relative flex flex-col gap-4 rounded-lg border border-ink-200 bg-surface p-5 shadow-xs outline-brand-600 transition-colors hover:border-ink-300 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2"
          >
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
              <div className="min-w-0">
                <h2 className="text-base font-semibold wrap-break-word text-ink-900">
                  <Link
                    to={qualityCheckHref(check.parentId ?? '', check.id)}
                    className="outline-none after:absolute after:inset-0"
                  >
                    {check.name || 'Untitled quality check'}
                  </Link>
                </h2>
                {meta.length > 0 && (
                  <p className="mt-0.5 text-sm text-ink-500">{meta.join(' · ')}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <PublishedBadge revision={check.publishedRevision} />
                {isAdmin && check.hasUnpublishedChanges && check.publishedRevision !== null && (
                  <Badge tone="brand">Unpublished changes</Badge>
                )}
              </div>
            </div>

            {sections.length > 0 ? (
              <ol aria-label="Sections" className="flex flex-wrap gap-1.5">
                {sections.map((title, index) => (
                  <li
                    key={index}
                    className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-md bg-ink-100 px-2.5 text-sm text-ink-800"
                  >
                    <span className="font-semibold tabular-nums">{sectionNumber(index)}</span>
                    <span className="truncate">{title || 'Untitled section'}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-ink-500">No sections yet.</p>
            )}

            <div className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t border-ink-100 pt-3">
              <dl className="grid grid-cols-3 gap-x-6 text-xs">
                <div>
                  <dt className="text-ink-500">Rows</dt>
                  <dd className="mt-0.5 text-sm font-semibold text-ink-900 tabular-nums">
                    {check.itemCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-500">Time</dt>
                  <dd className="mt-0.5 text-sm font-semibold text-ink-900 tabular-nums">
                    {formatHours(check.totalHours ?? 0)}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-500">Last edited</dt>
                  <dd
                    className="mt-0.5 text-sm font-semibold whitespace-nowrap text-ink-900 tabular-nums"
                    title={personName(check.updatedBy)}
                  >
                    {formatDate(check.updatedAt)}
                  </dd>
                </div>
              </dl>
              {/* The card is the link; this only shows it, so it is no second stop. */}
              <span aria-hidden="true" className={buttonClasses('secondary', 'h-8')}>
                Open
              </span>
            </div>
          </li>
        );
      })}
      {isAdmin && (
        <li>
          <button
            type="button"
            onClick={onNew}
            className="flex size-full min-h-56 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-ink-400 p-5 text-center text-ink-600 transition-colors hover:border-brand-500 hover:bg-brand-50 hover:text-brand-800"
          >
            <Plus size={24} aria-hidden="true" className="text-brand-600" />
            <span className="font-semibold text-brand-700">New quality check</span>
            <span className="max-w-64 text-sm">
              Another position along the build for this machine, such as QC1 or QC2.
            </span>
          </button>
        </li>
      )}
    </ul>
  );
}
