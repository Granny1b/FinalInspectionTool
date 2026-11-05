import { QUALITY_VERDICT_LABELS, type Guide } from '@modig/shared';
import clsx from 'clsx';
import { ImageOff, ImagePlus, Info, LoaderCircle } from 'lucide-react';
import { useImageUrl } from '../../lib/images';
import { shownImageId } from '../annotate/photos';
import { VERDICT_ICONS, VERDICT_TONES } from '../guides/verdicts';

type Props = {
  guide: Guide | undefined;
  /** "1.a" */
  rowRef: string;
  /** Opens the pictures: the editor for admins, the viewer on a read-only card. */
  onOpen: () => void;
  /** Editable: a row without pictures offers to add them. */
  editable: boolean;
};

/** "3 pictures", "1 picture". */
function pictureCountText(count: number): string {
  return count === 1 ? '1 picture' : `${count} pictures`;
}

/**
 * The picture at the left of a quality check's row: its first picture (as marked up) with its
 * verdict, ✓ should or ✗ should not look like this, and "+2" when there are more. A click opens
 * them all with the row's more information. Without pictures it says there is information, or,
 * to an admin, offers to add pictures.
 */
export function PictureTile({ guide, rowRef, onOpen, editable }: Props) {
  const images = guide?.images ?? [];
  const first = images[0];
  const url = useImageUrl(first ? shownImageId(first) : undefined);
  const more = images.length - 1;

  const label = first
    ? `Pictures of row ${rowRef}: ${pictureCountText(images.length)}, the first one ${QUALITY_VERDICT_LABELS[first.verdict].toLowerCase()}${guide?.description ? ', and more information' : ''}`
    : guide?.description
      ? `More information about row ${rowRef}`
      : `Add pictures to row ${rowRef}`;

  const frame =
    'relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md transition-colors';

  if (!first) {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label={label}
        title={label}
        data-row-pictures={rowRef}
        className={clsx(
          frame,
          'flex-col gap-1 px-1 text-center text-xs font-medium',
          guide?.description
            ? 'border border-ink-200 bg-ink-50 text-ink-600 hover:border-ink-400'
            : 'border border-dashed border-ink-400 bg-surface text-ink-600 hover:border-brand-500 hover:bg-brand-50 hover:text-brand-700',
        )}
      >
        {guide?.description ? (
          <>
            <Info size={18} aria-hidden="true" className="shrink-0" />
            <span className="max-[22rem]:sr-only">Information</span>
          </>
        ) : (
          <>
            <ImagePlus size={18} aria-hidden="true" className="shrink-0" />
            {editable && <span>Add pictures</span>}
          </>
        )}
      </button>
    );
  }

  const Icon = VERDICT_ICONS[first.verdict];
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      title={label}
      data-row-pictures={rowRef}
      className={clsx(frame, 'border border-ink-200 bg-ink-50 hover:border-ink-400')}
    >
      {url.data ? (
        // Whole, as the pictures are drawn on: marks near an edge must not be cropped away.
        <img
          src={url.data}
          crossOrigin="anonymous"
          alt=""
          className="size-full bg-surface object-contain"
        />
      ) : url.isError ? (
        <ImageOff size={18} aria-hidden="true" className="text-ink-400" />
      ) : (
        <LoaderCircle size={18} aria-hidden="true" className="animate-spin text-ink-400" />
      )}
      {/* The verdict as a symbol: its words are in the label and the pictures' dialog. */}
      <span
        data-verdict={first.verdict}
        className={clsx(
          'absolute bottom-1 left-1 flex size-5.5 items-center justify-center rounded-full shadow-sm ring-1 ring-inset',
          VERDICT_TONES[first.verdict],
        )}
      >
        <Icon size={13} strokeWidth={3} aria-hidden="true" />
      </span>
      {more > 0 && (
        <span className="absolute right-1 bottom-1 flex h-5.5 items-center rounded-full bg-scrim/70 px-1.5 text-[0.6875rem] font-semibold text-white tabular-nums">
          +{more}
        </span>
      )}
    </button>
  );
}
