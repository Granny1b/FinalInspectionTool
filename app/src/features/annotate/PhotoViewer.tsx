import type { AnnotatedImage } from '@modig/shared';
import { ChevronLeft, ChevronRight, ImageOff, LoaderCircle } from 'lucide-react';
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Button } from '../../components/Button';
import { useImageUrl } from '../../lib/images';
import { shownImageId } from './photos';

const STEP = 'px-2 aria-disabled:pointer-events-none aria-disabled:opacity-50';

type Props = {
  photo: AnnotatedImage;
  /** "Photo 2" */
  title: string;
  /** What the photos belong to, under the title. */
  label: string;
  onClose: () => void;
  /** Shown before the caption, e.g. a guide image's verdict. */
  badge?: ReactNode;
  /** Stepping through a set (the guide viewer): ← / → and the buttons show the neighbours. */
  browse?: { index: number; count: number; onStep: (index: number) => void };
};

/** A photo with its marks (the flattened copy), large, read-only; Escape or Close closes it. */
export function PhotoViewer({ photo, title, label, onClose, badge, browse }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const url = useImageUrl(shownImageId(photo));
  const previous = browse && browse.index > 0 ? browse.index - 1 : null;
  const next = browse && browse.index < browse.count - 1 ? browse.index + 1 : null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    // The page behind the modal never sees its keys (a checklist row would take "1" as OK).
    event.stopPropagation();
    const to = event.key === 'ArrowLeft' ? previous : event.key === 'ArrowRight' ? next : null;
    if (to === null || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    browse?.onStep(to);
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      data-photo-viewer=""
      onClose={onClose}
      onKeyDown={onKeyDown}
      className="m-auto h-[calc(100dvh-2rem)] max-h-none w-[min(80rem,calc(100vw-2rem))] max-w-none overflow-hidden rounded-xl border border-ink-200 bg-surface p-0 text-ink-900 shadow-xl backdrop:bg-ink-950/50"
    >
      <div className="flex h-full flex-col">
        <header className="border-b border-ink-200 px-4 py-2.5">
          <h2 id={titleId} className="truncate text-sm font-semibold text-ink-900">
            {title}
          </h2>
          <p className="truncate text-xs text-ink-500">{label}</p>
        </header>
        <div className="flex min-h-0 flex-1 items-center justify-center bg-ink-900 p-4">
          {url.data ? (
            <img
              src={url.data}
              crossOrigin="anonymous"
              alt={photo.caption ?? title}
              className="max-h-full max-w-full object-contain shadow-lg"
            />
          ) : url.isError ? (
            <p className="flex items-center gap-2 text-sm text-ink-200">
              <ImageOff size={18} aria-hidden="true" />
              The photo couldn’t be loaded.
            </p>
          ) : (
            <LoaderCircle
              size={22}
              aria-label="Loading photo"
              className="animate-spin text-ink-300"
            />
          )}
        </div>
        <footer className="flex flex-wrap items-center gap-3 border-t border-ink-200 px-4 py-3">
          <div className="flex min-w-0 flex-1 basis-60 items-center gap-3">
            {badge}
            <p className="min-w-0 text-sm text-ink-700">{photo.caption}</p>
          </div>
          {browse && (
            <div className="flex items-center gap-1">
              {/* aria-disabled at the ends: a disabled button would drop the keyboard focus. */}
              <Button
                variant="secondary"
                aria-label="Previous"
                aria-keyshortcuts="ArrowLeft"
                title="Previous (←)"
                aria-disabled={previous === null || undefined}
                onClick={() => previous !== null && browse.onStep(previous)}
                className={STEP}
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </Button>
              <span className="min-w-12 text-center text-xs text-ink-500 tabular-nums">
                {browse.index + 1} / {browse.count}
              </span>
              <Button
                variant="secondary"
                aria-label="Next"
                aria-keyshortcuts="ArrowRight"
                title="Next (→)"
                aria-disabled={next === null || undefined}
                onClick={() => next !== null && browse.onStep(next)}
                className={STEP}
              >
                <ChevronRight size={16} aria-hidden="true" />
              </Button>
            </div>
          )}
          <form method="dialog">
            <Button type="submit" variant="secondary">
              Close
            </Button>
          </form>
        </footer>
      </div>
    </dialog>
  );
}
