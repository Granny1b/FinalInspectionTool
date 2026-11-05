import type { MachineModel, TemplateSummary } from '@modig/shared';
import clsx from 'clsx';
import { Link } from 'react-router';
import { formatDate } from '../../lib/format';
import { usePersonName } from '../../lib/usePeople';
import { modelName } from '../../lib/useSettings';
import { Badge, PublishedBadge } from './Badge';
import { qualityCheckPositions } from './qualityCheckList';

type Props = {
  /** The final inspection templates, one per machine model. */
  templates: TemplateSummary[];
  /** Each template's quality checks, by its id. */
  qualityChecks: ReadonlyMap<string, TemplateSummary[]>;
  models: MachineModel[] | undefined;
  /** Admins also see which drafts have unpublished changes. */
  showDrafts: boolean;
};

/**
 * A narrow screen keeps what tells the templates apart (name, model, published revision) and
 * leaves out the last edit, then also the row count, instead of squeezing the names into a column
 * a word wide or scrolling the table sideways; the editor and the cards still show both. On a phone
 * the headers and models may wrap too, and the cells are a little tighter, so the three columns
 * fit beside "Unpublished changes" and "Not published".
 */
const HEAD = 'px-2.5 py-2.5 font-medium sm:px-4 sm:whitespace-nowrap';
const CELL = 'px-2.5 py-3.5 sm:px-4';
const FROM_SM = 'hidden sm:table-cell';
const FROM_MD = 'hidden md:table-cell';

/** One row per template; the whole row opens it. */
export function TemplateList({ templates, qualityChecks, models, showDrafts }: Props) {
  const personName = usePersonName();
  return (
    <div className="overflow-x-auto rounded-lg border border-ink-200 bg-surface">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-ink-200 bg-ink-50 text-xs text-ink-500">
          <tr>
            <th scope="col" className={HEAD}>
              Template
            </th>
            <th scope="col" className={HEAD}>
              Machine model
            </th>
            <th scope="col" className={HEAD}>
              Published
            </th>
            <th scope="col" className={clsx(HEAD, FROM_SM, 'text-right')}>
              Rows
            </th>
            <th scope="col" className={clsx(HEAD, FROM_SM)}>
              Quality checks
            </th>
            <th scope="col" className={clsx(HEAD, FROM_MD)}>
              Last edited
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {templates.map((template) => (
            <tr
              key={template.id}
              // The name's link covers the row; the outline shows where keyboard focus is.
              className="relative -outline-offset-2 outline-brand-600 transition-colors hover:bg-ink-50 has-[a:focus-visible]:outline-2"
            >
              <td className={CELL}>
                <Link
                  to={`/templates/${template.id}`}
                  className="font-medium text-ink-900 outline-none after:absolute after:inset-0"
                >
                  {template.name || 'Untitled template'}
                </Link>
                {showDrafts && template.hasUnpublishedChanges && (
                  <div className="mt-1">
                    <Badge tone="brand">Unpublished changes</Badge>
                  </div>
                )}
              </td>
              <td className={clsx(CELL, 'text-ink-700 sm:whitespace-nowrap')}>
                {modelName(models, template.modelCode)}
              </td>
              <td className={CELL}>
                <PublishedBadge revision={template.publishedRevision} />
              </td>
              <td className={clsx(CELL, FROM_SM, 'text-right text-ink-700 tabular-nums')}>
                {template.itemCount}
              </td>
              <QualityChecksCell checks={qualityChecks.get(template.id) ?? []} />
              <td className={clsx(CELL, FROM_MD, 'max-w-56')}>
                <div className="whitespace-nowrap text-ink-700">
                  {formatDate(template.updatedAt)}
                </div>
                <div className="truncate text-xs text-ink-500" title={template.updatedBy}>
                  {personName(template.updatedBy)}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** How many quality checks a machine has, and their positions. */
function QualityChecksCell({ checks }: { checks: TemplateSummary[] }) {
  const positions = qualityCheckPositions(checks);
  return (
    <td className={clsx(CELL, FROM_SM, 'max-w-48')}>
      <div className="text-ink-700 tabular-nums">
        {checks.length === 0 ? 'None' : checks.length}
      </div>
      {positions && (
        <div className="truncate text-xs text-ink-500" title={positions}>
          {positions}
        </div>
      )}
    </td>
  );
}
