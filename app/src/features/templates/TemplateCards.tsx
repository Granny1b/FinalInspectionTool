import type { MachineModel, TemplateSummary } from '@modig/shared';
import clsx from 'clsx';
import { ImageOff, LayoutTemplate, LoaderCircle } from 'lucide-react';
import { Link } from 'react-router';
import { formatDate } from '../../lib/format';
import { useImageUrl } from '../../lib/images';
import { usePersonName } from '../../lib/usePeople';
import { modelName } from '../../lib/useSettings';
import { Badge, PublishedBadge } from './Badge';

type Props = {
  templates: TemplateSummary[];
  models: MachineModel[] | undefined;
  /** Admins also see which drafts have unpublished changes. */
  showDrafts: boolean;
};

/**
 * The templates as cards with their cover photos; the whole card opens the template.
 *
 * Every card spans four rows of the list's grid (photo, name and model, badges, Rows and Last
 * edited) and lays its parts on them (a subgrid), so across a row of cards each part starts at
 * the same height: a name on two lines or badges that wrap move the line below them in every
 * card of the row, and the footers line up at the bottom.
 */
export function TemplateCards({ templates, models, showDrafts }: Props) {
  // The name, as in the list; the email stays in the tooltip.
  const personName = usePersonName();
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {templates.map((template) => (
        <li
          key={template.id}
          // The name's link covers the card; the outline shows where keyboard focus is.
          className="relative row-span-4 grid grid-rows-subgrid gap-y-0 overflow-hidden rounded-lg border border-ink-200 bg-surface shadow-xs outline-brand-600 transition-colors hover:border-ink-300 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2"
        >
          <Cover imageId={template.coverImageId} />
          <div className="min-w-0 px-4 pt-3.5">
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
          {/* The list's badges: the draft is only mentioned when it differs from the published
              revision, as otherwise there is nothing to publish. */}
          <div className="flex flex-wrap content-start gap-1.5 px-4 pt-3 pb-4">
            <PublishedBadge revision={template.publishedRevision} />
            {showDrafts && template.hasUnpublishedChanges && (
              <Badge tone="brand">Unpublished changes</Badge>
            )}
          </div>
          <dl className="mx-4 grid grid-cols-[auto_minmax(0,1fr)] content-end gap-x-3 gap-y-1 border-t border-ink-100 py-3 text-xs">
            <dt className="text-ink-500">Rows</dt>
            <dd className="text-ink-800 tabular-nums">{template.itemCount}</dd>
            <dt className="text-ink-500">Last edited</dt>
            <dd className="truncate text-ink-800" title={template.updatedBy}>
              {formatDate(template.updatedAt)} · {personName(template.updatedBy)}
            </dd>
          </dl>
        </li>
      ))}
    </ul>
  );
}

/**
 * The cover photo, or a neutral placeholder without one, in a frame of one shape for every card
 * (16:10, as product renders are mostly wide), so photos of any proportions take the same height.
 * The photo is fitted whole and centred, with even room around it.
 *
 * Renders come on white. The frame is a light panel the photo is multiplied onto, so a white
 * background takes the panel's colour and the photo seems printed on it rather than pasted in:
 * near-white ink-50 in the light theme, and in the dark theme a light grey (ink-800 there), a
 * mat inset in the card that doesn't glare as pure white would. Without a photo the frame stays
 * quiet in the card's own greys. Decorative: the name says it all.
 */
function Cover({ imageId }: { imageId: string | undefined }) {
  const url = useImageUrl(imageId);
  const photo = imageId ? url.data : undefined;
  return (
    <div className="px-2 pt-2">
      <div
        className={clsx(
          'relative isolate flex aspect-[16/10] items-center justify-center overflow-hidden rounded-md ring-1 ring-inset',
          photo
            ? 'bg-ink-50 ring-ink-200 dark:bg-ink-800 dark:ring-ink-600'
            : 'bg-ink-50 text-ink-400 ring-ink-200',
        )}
      >
        {!imageId ? (
          <LayoutTemplate size={28} strokeWidth={1.5} aria-hidden="true" />
        ) : photo ? (
          <img
            src={photo}
            alt=""
            className="absolute inset-0 size-full object-contain p-4 mix-blend-multiply"
          />
        ) : url.isError ? (
          <ImageOff size={24} strokeWidth={1.5} aria-hidden="true" />
        ) : (
          <LoaderCircle size={20} aria-hidden="true" className="animate-spin" />
        )}
      </div>
    </div>
  );
}
