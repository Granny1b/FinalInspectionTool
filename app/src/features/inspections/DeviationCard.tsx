import {
  MAX_PHOTOS_PER_DEVIATION,
  SEVERITY_LABELS,
  type AnnotatedImage,
  type InspectionDeviation,
  type Severity,
} from '@modig/shared';
import clsx from 'clsx';
import { CornerDownRight, Trash2 } from 'lucide-react';
import { useId } from 'react';
import { AnnotatedPhotos } from '../annotate/AnnotatedPhotos';
import { ExtraDeviationFields } from './ExtraDeviationFields';
import type { ExtraDeviationPatch } from './extras';
import { deviationPhotosId } from './issues';

type Props = {
  deviation: InspectionDeviation;
  readOnly: boolean;
  /** Finalise problem of an extra deviation ("needs a description"). */
  issue: string | undefined;
  /** The summary's one `<datalist>` of resp suggestions. */
  respListId: string;
  onGoToRow: (itemId: string) => void;
  onUpdate: (id: string, patch: ExtraDeviationPatch) => void;
  onRemove: (deviation: InspectionDeviation) => void;
  onPhotosChange: (deviation: InspectionDeviation, photos: AnnotatedImage[]) => void;
};

/**
 * One deviation, as it prints on the report's deviation pages: D-nn, ref, checkpoint (or the
 * extra deviation's description), comment, severity, resp, and up to two marked-up photos. A row
 * deviation is edited in its row (the ref jumps there); an extra deviation in the card itself.
 * Photos are added here for both.
 */
export function DeviationCard({
  deviation,
  readOnly,
  issue,
  respListId,
  onGoToRow,
  onUpdate,
  onRemove,
  onPhotosChange,
}: Props) {
  const titleId = useId();
  const { number, itemId } = deviation;
  const editable = deviation.kind === 'extra' && !readOnly;
  return (
    <article
      aria-labelledby={titleId}
      data-deviation={number}
      className={clsx(
        '@container rounded-lg border bg-surface shadow-xs',
        issue ? 'border-nok-fg' : 'border-ink-200',
      )}
    >
      {/* Not a <header>: the page's sticky header stays the only one in <main>. */}
      <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 border-b border-ink-200 py-1.5 pr-2 pl-4">
        <h3 id={titleId} className="text-sm font-semibold text-ink-900">
          {number}
        </h3>
        {itemId ? (
          <>
            <GoToRow deviationRef={deviation.ref} onClick={() => onGoToRow(itemId)} />
            <span className="min-w-0 flex-1 truncate text-xs text-ink-500">
              {deviation.sectionTitle}
            </span>
          </>
        ) : (
          <span className="min-w-0 flex-1 text-xs text-ink-500">Not on the checklist</span>
        )}
        {editable ? (
          <button
            type="button"
            onClick={() => onRemove(deviation)}
            aria-label={`Remove ${number}`}
            title="Remove"
            className="flex size-8 items-center justify-center rounded-md text-ink-500 transition-colors hover:bg-nok-bg hover:text-nok-fg"
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        ) : (
          <SeverityBadge severity={deviation.severity} />
        )}
      </div>

      <div className="grid gap-x-6 gap-y-4 p-4 @min-[46rem]:grid-cols-[minmax(0,1fr)_20.75rem]">
        <div className="min-w-0">
          {editable ? (
            <ExtraDeviationFields
              deviation={deviation}
              issue={issue}
              respListId={respListId}
              onUpdate={onUpdate}
            />
          ) : (
            <Details deviation={deviation} />
          )}
        </div>
        <Photos deviation={deviation} readOnly={readOnly} onChange={onPhotosChange} />
      </div>
    </article>
  );
}

/** The row's ref as a link to it: switches to the checklist and focuses the row. */
function GoToRow({ deviationRef, onClick }: { deviationRef: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Row ${deviationRef}, go to it in the checklist`}
      title="Go to the row"
      className="inline-flex items-center gap-1 rounded-sm text-sm font-medium text-brand-700 underline-offset-2 hover:underline"
    >
      {deviationRef}
      <CornerDownRight size={13} aria-hidden="true" />
    </button>
  );
}

const SEVERITY_TONES: Record<Severity, string> = {
  minor: 'bg-ink-100 text-ink-700 ring-ink-300',
  major: 'bg-nok-bg text-nok-fg ring-nok-border',
  critical: 'bg-nok-fg text-white ring-nok-fg',
};

/** The severity in words, never by colour alone; critical is the one filled badge. */
function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={clsx(
        'mr-2 inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold ring-1 ring-inset',
        SEVERITY_TONES[severity],
      )}
    >
      <span className="sr-only">Severity: </span>
      {SEVERITY_LABELS[severity]}
    </span>
  );
}

/** A row deviation (or any deviation once finalised) as text: it is edited in its row. */
function Details({ deviation }: { deviation: InspectionDeviation }) {
  return (
    <>
      <p className="text-sm leading-5 font-medium wrap-break-word text-ink-900">
        {deviation.text || <span className="font-normal text-ink-500">No description</span>}
      </p>
      <dl className="mt-3 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm leading-5">
        <dt className="text-ink-500">Comment</dt>
        <dd className="wrap-break-word text-ink-800">{deviation.comment || '—'}</dd>
        <dt className="text-ink-500">Resp</dt>
        <dd className="wrap-break-word text-ink-800">{deviation.resp || '—'}</dd>
      </dl>
    </>
  );
}

type PhotosProps = {
  deviation: InspectionDeviation;
  readOnly: boolean;
  onChange: (deviation: InspectionDeviation, photos: AnnotatedImage[]) => void;
};

/**
 * The deviation's photos. The block is the target of a NOK row's photo count (focusable from
 * script only); the page moves the focus on to its first button.
 */
function Photos({ deviation, readOnly, onChange }: PhotosProps) {
  const { photos, number } = deviation;
  return (
    <div id={deviationPhotosId(deviation.key)} tabIndex={-1} className="min-w-0 outline-none">
      <p className="mb-2 flex items-baseline justify-between text-xs font-medium text-ink-600">
        Photos
        {!readOnly && (
          <span className="font-normal text-ink-500 tabular-nums">
            {photos.length} / {MAX_PHOTOS_PER_DEVIATION}
          </span>
        )}
      </p>
      {readOnly && photos.length === 0 ? (
        <p className="text-sm text-ink-500">No photos</p>
      ) : (
        <AnnotatedPhotos
          photos={photos}
          onChange={readOnly ? undefined : (next) => onChange(deviation, next)}
          max={MAX_PHOTOS_PER_DEVIATION}
          label={`Photos of ${number}`}
        />
      )}
    </div>
  );
}
