import type { MachineModel, TemplateSummary } from '@modig/shared';
import { Link } from 'react-router';
import { formatDate } from '../../lib/format';
import { modelName } from '../../lib/useSettings';
import { Badge, PublishedBadge } from './Badge';

type Props = {
  templates: TemplateSummary[];
  models: MachineModel[] | undefined;
  /** Admins also see which drafts have unpublished changes. */
  showDrafts: boolean;
};

const HEAD = 'px-4 py-2.5 font-medium whitespace-nowrap';

/** One row per template; the whole row opens it. */
export function TemplateList({ templates, models, showDrafts }: Props) {
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
            <th scope="col" className={`${HEAD} text-right`}>
              Rows
            </th>
            <th scope="col" className={HEAD}>
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
              <td className="px-4 py-3.5">
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
              <td className="px-4 py-3.5 whitespace-nowrap text-ink-700">
                {modelName(models, template.modelCode)}
              </td>
              <td className="px-4 py-3.5">
                <PublishedBadge revision={template.publishedRevision} />
              </td>
              <td className="px-4 py-3.5 text-right text-ink-700 tabular-nums">
                {template.itemCount}
              </td>
              <td className="max-w-56 px-4 py-3.5">
                <div className="whitespace-nowrap text-ink-700">
                  {formatDate(template.updatedAt)}
                </div>
                <div className="truncate text-xs text-ink-500" title={template.updatedBy}>
                  {template.updatedBy}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
