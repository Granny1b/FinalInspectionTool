import type { MachineModel, TemplateSummary } from '@modig/shared';
import { ImageOff, LayoutTemplate, LoaderCircle } from 'lucide-react';
import { Link } from 'react-router';
import { formatDate } from '../../lib/format';
import { useImageUrl } from '../../lib/images';
import { modelName } from '../../lib/useSettings';
import { Badge, PublishedBadge } from './Badge';

type Props = {
  templates: TemplateSummary[];
  models: MachineModel[] | undefined;
  /** Admins also see which drafts have unpublished changes. */
  showDrafts: boolean;
};

/** The templates as cards with their cover photos; the whole card opens the template. */
export function TemplateCards({ templates, models, showDrafts }: Props) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {templates.map((template) => (
        <li
          key={template.id}
          // The name's link covers the card; the outline shows where keyboard focus is.
          className="relative flex flex-col overflow-hidden rounded-lg border border-ink-200 bg-surface shadow-xs outline-brand-600 transition-colors hover:border-ink-300 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2"
        >
          <Cover imageId={template.coverImageId} />
          <div className="flex flex-1 flex-col gap-3 p-4">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-ink-900">
                <Link
                  to={`/templates/${template.id}`}
                  className="outline-none after:absolute after:inset-0"
                >
                  {template.name || 'Untitled template'}
                </Link>
              </h2>
              <p className="mt-0.5 truncate text-sm text-ink-600">
                {modelName(models, template.modelCode)}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <PublishedBadge revision={template.publishedRevision} />
              {showDrafts && <Badge>Draft · Rev {template.draftRevision}</Badge>}
              {showDrafts && template.hasUnpublishedChanges && (
                <Badge tone="brand">Unpublished changes</Badge>
              )}
            </div>
            <dl className="mt-auto grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-t border-ink-100 pt-3 text-xs">
              <dt className="text-ink-500">Rows</dt>
              <dd className="text-ink-800 tabular-nums">{template.itemCount}</dd>
              <dt className="text-ink-500">Last edited</dt>
              <dd className="truncate text-ink-800" title={template.updatedBy}>
                {formatDate(template.updatedAt)} · {template.updatedBy}
              </dd>
            </dl>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The cover photo, or a neutral placeholder without one. Decorative: the name says it all. */
function Cover({ imageId }: { imageId: string | undefined }) {
  const url = useImageUrl(imageId);
  return (
    <div className="flex aspect-[16/9] items-center justify-center border-b border-ink-100 bg-ink-50 text-ink-400">
      {!imageId ? (
        <LayoutTemplate size={28} strokeWidth={1.5} aria-hidden="true" />
      ) : url.data ? (
        <img src={url.data} alt="" className="size-full bg-surface object-contain" />
      ) : url.isError ? (
        <ImageOff size={24} strokeWidth={1.5} aria-hidden="true" />
      ) : (
        <LoaderCircle size={20} aria-hidden="true" className="animate-spin" />
      )}
    </div>
  );
}
