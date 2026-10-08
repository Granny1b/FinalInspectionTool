import { GUIDE_VERDICT_LABELS, refWithText, type Guide, type GuideImage } from '@modig/shared';
import clsx from 'clsx';
import { ImageOff, LoaderCircle } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '../../components/Button';
import { useImageUrl } from '../../lib/images';
import { shownImageId } from '../annotate/photos';
import { PhotoViewer } from '../annotate/PhotoViewer';
import { VerdictBadge } from './Verdict';

type Props = {
  /** "3.c" */
  rowRef: string;
  rowText: string;
  guide: Guide;
  onClose: () => void;
};

/**
 * A row's guide, read-only (brief §5.3, §5.4): the description and the reference images with
 * their verdicts and captions. A click shows an image large, where ← / → step through them;
 * in the gallery the arrow keys move between the images. Escape closes.
 */
export function GuideViewer({ rowRef, rowText, guide, onClose }: Props) {
  const [viewing, setViewing] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const titleId = useId();
  const { description, images } = guide;
  const shown = viewing === null ? undefined : images[viewing];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  function tiles(): HTMLButtonElement[] {
    return Array.from(listRef.current?.querySelectorAll('button') ?? []);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    // The checklist behind never sees its keys (a row would take "1" as OK).
    event.stopPropagation();
    const list = tiles();
    const current = list.indexOf(event.target as HTMLButtonElement);
    if (current < 0 || event.altKey || event.ctrlKey || event.metaKey) return;
    const to =
      event.key === 'ArrowRight'
        ? current + 1
        : event.key === 'ArrowLeft'
          ? current - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? list.length - 1
              : null;
    if (to === null) return;
    event.preventDefault();
    list[Math.min(Math.max(to, 0), list.length - 1)]?.focus();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      data-guide-viewer=""
      // React passes `close` up from the large view inside this dialog; only its own counts.
      onClose={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={onKeyDown}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(64rem,calc(100vw-2rem))] max-w-none flex-col overflow-hidden rounded-xl border border-ink-200 bg-surface p-0 text-ink-900 shadow-xl backdrop:bg-ink-950/50 open:flex"
    >
      <header className="border-b border-ink-200 px-5 py-3.5">
        <h2 id={titleId} className="line-clamp-2 text-base font-semibold">
          Guide · {refWithText(rowRef, rowText)}
        </h2>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {description && (
          <p className="max-w-prose text-sm leading-6 whitespace-pre-line text-ink-800">
            {description}
          </p>
        )}
        {images.length > 0 && (
          <ul
            ref={listRef}
            aria-label="Reference images"
            className={clsx(
              'grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-x-4 gap-y-5',
              description && 'mt-5',
            )}
          >
            {images.map((image, index) => (
              <Tile
                key={`${index}-${image.imageId}`}
                image={image}
                index={index}
                onOpen={() => setViewing(index)}
              />
            ))}
          </ul>
        )}
        {!description && images.length === 0 && (
          <p className="text-sm text-ink-500">This guide is empty.</p>
        )}
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-ink-200 px-5 py-3">
        {images.length > 1 ? (
          <p className="text-xs text-ink-500 pointer-coarse:invisible">
            ← / → move between the images
          </p>
        ) : (
          <span />
        )}
        <form method="dialog">
          <Button type="submit" variant="secondary">
            Close
          </Button>
        </form>
      </footer>

      {viewing !== null && shown && (
        <PhotoViewer
          photo={shown}
          title={`Image ${viewing + 1} of ${images.length}`}
          label={`Guide · ${rowRef}`}
          badge={<VerdictBadge verdict={shown.verdict} />}
          browse={{ index: viewing, count: images.length, onStep: setViewing }}
          onClose={() => {
            // Back in the gallery on the image last shown, not the one first opened.
            tiles()[viewing]?.focus();
            setViewing(null);
          }}
        />
      )}
    </dialog>
  );
}

/** One reference image: its marked-up copy with the verdict on it, the caption below. */
function Tile({ image, index, onOpen }: { image: GuideImage; index: number; onOpen: () => void }) {
  const url = useImageUrl(shownImageId(image));
  const verdict = GUIDE_VERDICT_LABELS[image.verdict];
  return (
    <li data-guide-image={index}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`View image ${index + 1}, ${verdict}${image.caption ? `: ${image.caption}` : ''}`}
        className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg border border-ink-200 bg-ink-50 transition-colors hover:border-ink-400"
      >
        {url.data ? (
          // Whole, as it prints: marks near an edge must not be cropped away.
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
        <VerdictBadge verdict={image.verdict} className="absolute top-2 left-2 shadow-sm" />
      </button>
      {image.caption && <p className="mt-1.5 text-sm leading-5 text-ink-700">{image.caption}</p>}
    </li>
  );
}
