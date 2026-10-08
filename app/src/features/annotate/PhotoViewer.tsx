import type { AnnotatedImage } from '@modig/shared';
import { ImageOff, LoaderCircle } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { Button } from '../../components/Button';
import { useImageUrl } from '../../lib/images';
import { shownImageId } from './photos';

type Props = {
  photo: AnnotatedImage;
  /** "Photo 2" */
  title: string;
  /** What the photos belong to, under the title. */
  label: string;
  onClose: () => void;
};

/** A photo with its marks (the flattened copy), large, read-only; Escape or Close closes it. */
export function PhotoViewer({ photo, title, label, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const url = useImageUrl(shownImageId(photo));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      data-photo-viewer=""
      onClose={onClose}
      // The page behind the modal never sees its keys (a checklist row would take "1" as OK).
      onKeyDown={(event) => event.stopPropagation()}
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
        <footer className="flex items-center gap-3 border-t border-ink-200 px-4 py-3">
          <p className="min-w-0 flex-1 text-sm text-ink-700">{photo.caption}</p>
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
