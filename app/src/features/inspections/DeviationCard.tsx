import {
  MAX_PHOTOS_PER_DEVIATION,
  refWithText,
  SEVERITY_LABELS,
  type AnnotatedImage,
  type FollowUp,
  type FollowUpRequest,
  type InspectionDeviation,
  type Severity,
} from '@modig/shared';
import clsx from 'clsx';
import { CornerDownRight, Trash2 } from 'lucide-react';
import { useId } from 'react';
import { AnnotatedPhotos } from '../annotate/AnnotatedPhotos';
import { FollowUpActions, StatusPill } from '../deviationLog/FollowUpActions';
import { ExtraDeviationFields } from './ExtraDeviationFields';
import type { ExtraDeviationPatch } from './extras';
import { deviationCardId, deviationPhotosId } from './issues';
import { LINK_TEXT } from './linkText';

type Props = {
  deviation: InspectionDeviation;
  readOnly: boolean;
  /** Finalise problem of an extra deviation ("needs a description"). */
  issue: string | undefined;
  /** The settings' Responsible list and deviation categories, for an extra deviation's fields. */
  responsibles: readonly string[];
  categories: readonly string[];
  onGoToRow: (itemId: string) => void;
  onUpdate: (id: string, patch: ExtraDeviationPatch) => void;
  onRemove: (deviation: InspectionDeviation) => void;
  onPhotosChange: (deviation: InspectionDeviation, photos: AnnotatedImage[]) => void;
  onEditorDirtyChange: (dirty: boolean) => void;
  /**
   * Its follow-up in the deviation log, once loaded (undefined: open); null while it loads, when
   * the card says nothing about it.
   */
  followUp: FollowUp | undefined | null;
  /** "QC-2026-0004 · D-03", its ID in the log. */
  logId: string;
  followUpPending: boolean;
  onFollowUp: (deviation: InspectionDeviation, request: FollowUpRequest) => void;
};

/**
 * One deviation, as it prints on the report's deviation pages: D-nn, ref, checkpoint (or the
 * extra deviation's description), comment, severity, category, responsible, and up to two
 * marked-up photos. A row
 * deviation is edited in its row (the ref jumps there); an extra deviation in the card itself.
 * Photos are added here for both.
 */
export function DeviationCard({
  deviation,
  readOnly,
  issue,
  responsibles,
  categories,
  onGoToRow,
  onUpdate,
  onRemove,
  onPhotosChange,
  onEditorDirtyChange,
  followUp,
  logId,
  followUpPending,
  onFollowUp,
}: Props) {
  const titleId = useId();
  const { number, itemId } = deviation;
  const editable = deviation.kind === 'extra' && !readOnly;
  return (
    <article
      id={deviationCardId(deviation.key)}
      // Focusable from script: the deviation log's links open the tab at it.
      tabIndex={-1}
      aria-labelledby={titleId}
      data-deviation={number}
      className={clsx(
        '@container rounded-lg border bg-surface shadow-xs outline-none focus-visible:outline-2',
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
            // 44 px for a finger, over the bar's padding, so the bar keeps its height.
            className="flex size-8 items-center justify-center rounded-md text-ink-500 transition-colors hover:bg-nok-bg hover:text-nok-fg pointer-coarse:-my-1.5 pointer-coarse:size-11"
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        ) : (
          <SeverityBadge severity={deviation.severity} className="mr-2" />
        )}
      </div>

      <div className="grid gap-x-6 gap-y-4 p-4 @min-[46rem]:grid-cols-[minmax(0,1fr)_20.75rem]">
        <div className="min-w-0">
          {editable ? (
            <ExtraDeviationFields
              deviation={deviation}
              issue={issue}
              responsibles={responsibles}
              categories={categories}
              onUpdate={onUpdate}
            />
          ) : (
            <Details deviation={deviation} />
          )}
        </div>
        <Photos
          deviation={deviation}
          readOnly={readOnly}
          onChange={onPhotosChange}
          onEditorDirtyChange={onEditorDirtyChange}
        />
      </div>
      {followUp !== null && (
        <FollowUpBar
          deviation={deviation}
          followUp={followUp}
          logId={logId}
          pending={followUpPending}
          onFollowUp={onFollowUp}
        />
      )}
    </article>
  );
}

type FollowUpBarProps = {
  deviation: InspectionDeviation;
  followUp: FollowUp | undefined;
  logId: string;
  pending: boolean;
  onFollowUp: Props['onFollowUp'];
};

/**
 * Its follow-up, as in the deviation log: Open or Closed (when, by whom, what was done), and
 * Close… or Edit and Reopen… Also on a finalised inspection: closing a deviation doesn't change
 * what the inspection found.
 */
function FollowUpBar({ deviation, followUp, logId, pending, onFollowUp }: FollowUpBarProps) {
  const status = followUp?.status ?? 'open';
  const action = followUp?.action ?? '';
  const closed = status === 'closed';
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-ink-200 px-4 py-2.5">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-600">
        <span className="sr-only">Follow-up:</span>
        <StatusPill status={status} />
        {closed && (followUp?.closedOn || followUp?.closedBy) && (
          <span>
            Closed <span className="tabular-nums">{followUp.closedOn}</span>
            {followUp.closedBy && ` by ${followUp.closedBy}`}
          </span>
        )}
        {action && (
          <span className="basis-full wrap-break-word whitespace-pre-line text-ink-700">
            <span className="font-medium text-ink-500">Action: </span>
            {action}
          </span>
        )}
      </div>
      <FollowUpActions
        target={{
          deviationId: logId,
          description: deviation.itemId
            ? refWithText(deviation.ref, deviation.text)
            : deviation.text,
          status,
          action,
          closedOn: followUp?.closedOn ?? '',
          closedBy: followUp?.closedBy ?? '',
        }}
        pending={pending}
        onChange={(request) => onFollowUp(deviation, request)}
      />
    </div>
  );
}

/**
 * The row's ref as a link to it: switches to the checklist and focuses the row. Padded out to a
 * button's size with the text where it was (and its ring around the text, LINK_TEXT); 44 px high
 * for a finger, over the bar's padding, so the bar keeps its height.
 */
function GoToRow({ deviationRef, onClick }: { deviationRef: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Row ${deviationRef}, go to it in the checklist`}
      title="Go to the row"
      className="group -mx-2 inline-flex min-h-8 items-center px-2 text-sm font-medium text-brand-700 outline-none pointer-coarse:-my-1.5 pointer-coarse:min-h-11"
    >
      <span className={LINK_TEXT}>
        {deviationRef}
        <CornerDownRight size={13} aria-hidden="true" />
      </span>
    </button>
  );
}

/**
 * Minor is neutral and major a red tint; critical is filled with the colour Insights gives it, so
 * the most severe is the strongest red on both pages, in both themes.
 */
const SEVERITY_TONES: Record<Severity, string> = {
  minor: 'bg-ink-100 text-ink-700 ring-ink-300',
  major: 'bg-nok-bg text-nok-fg ring-nok-border',
  critical: 'bg-severity-critical text-on-severity-critical ring-severity-critical',
};

/**
 * The severity in words, never by colour alone; critical is the one filled badge. Also in the
 * deviation log.
 */
export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset',
        SEVERITY_TONES[severity],
        className,
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
      <dl className="mt-3 grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm leading-5">
        <dt className="text-ink-500">Comment</dt>
        <dd className="wrap-break-word text-ink-800">{deviation.comment || '—'}</dd>
        <dt className="text-ink-500">Responsible</dt>
        <dd className="wrap-break-word text-ink-800">{deviation.resp || '—'}</dd>
        <dt className="text-ink-500">Category</dt>
        <dd className="wrap-break-word text-ink-800">{deviation.category || '—'}</dd>
      </dl>
    </>
  );
}

type PhotosProps = {
  deviation: InspectionDeviation;
  readOnly: boolean;
  onChange: (deviation: InspectionDeviation, photos: AnnotatedImage[]) => void;
  onEditorDirtyChange: (dirty: boolean) => void;
};

/**
 * The deviation's photos. The block is the target of a NOK row's photo count (focusable from
 * script only); the page moves the focus on to its first button.
 */
function Photos({ deviation, readOnly, onChange, onEditorDirtyChange }: PhotosProps) {
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
          onDirtyChange={onEditorDirtyChange}
        />
      )}
    </div>
  );
}
