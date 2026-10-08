import { MAX_GUIDE_IMAGES, refWithText, type Guide, type GuideImage } from '@modig/shared';
import clsx from 'clsx';
import { Trash2 } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { INPUT } from '../../components/Field';
import { AnnotatedPhotos } from '../annotate/AnnotatedPhotos';
import {
  guideDraft,
  sameGuide,
  savedGuide,
  updateImage,
  withVerdicts,
  type GuideDraft,
} from './guide';
import { VerdictPicker } from './Verdict';

type Props = {
  /** "3.c" */
  rowRef: string;
  rowText: string;
  guide: Guide | undefined;
  /** The guide to store in the draft: undefined when it was removed or left empty. */
  onSave: (guide: Guide | undefined) => void;
  onCancel: () => void;
  /** Whether it holds changes not in the draft yet (for the page's leave guard). */
  onDirtyChange?: (dirty: boolean) => void;
};

/**
 * The guide of one checklist row (brief §5.4), for admins in the template editor: a short
 * description and up to six reference images, each tagged Good / Bad / Info with a caption and
 * marked up in the annotation editor. Images are added by file picker, paste or drop anywhere in
 * the dialog. Save puts the guide into the draft, which then autosaves; Escape or Cancel asks
 * before discarding changes.
 */
export function GuideEditor({ rowRef, rowText, guide, onSave, onCancel, onDirtyChange }: Props) {
  const [draft, setDraft] = useState<GuideDraft>(() => guideDraft(guide));
  const [photoDirty, setPhotoDirty] = useState(false);
  const [confirming, setConfirming] = useState<'discard' | 'remove' | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  /** What closing reports: the guide to save, or null for Cancel. */
  const outcome = useRef<{ guide: Guide | undefined } | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const imagesId = useId();
  const saved = savedGuide(draft);
  const changed = !sameGuide(saved, guide);
  const dirty = changed || photoDirty;
  const title = `Guide · ${refWithText(rowRef, rowText)}`;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // Back or a link would lose the changes: the page's leave guard asks while this is true.
  useEffect(() => {
    if (!dirty || !onDirtyChange) return;
    onDirtyChange(true);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  function close(result: { guide: Guide | undefined } | null) {
    outcome.current = result;
    // Closed through the dialog, so the focus goes back to the row's Guide button.
    dialogRef.current?.close();
  }

  function requestCancel() {
    if (changed) setConfirming('discard');
    else close(null);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    // Nothing behind the modal reacts to its keys.
    event.stopPropagation();
    // Escape is this dialog's only when it comes from its own content: the dialogs it opens
    // (the photo editor, a confirmation) handle theirs.
    const own =
      event.target instanceof Element && event.target.closest('dialog') === dialogRef.current;
    if (event.key !== 'Escape' || !own) return;
    // Handled here, not by the dialog: Chrome refuses only one Escape per click.
    event.preventDefault();
    requestCancel();
  }

  const patchImage = (index: number, patch: ImagePatch) =>
    setDraft((current) => ({ ...current, images: updateImage(current.images, index, patch) }));

  return (
    <>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        data-guide-editor=""
        closedby="none"
        // React passes `cancel` and `close` up from the dialogs inside this one (the photo editor,
        // confirmations); only this dialog's own count.
        onCancel={(event) => {
          if (event.target === event.currentTarget) event.preventDefault();
        }}
        onClose={(event) => {
          if (event.target !== event.currentTarget) return;
          if (outcome.current) onSave(outcome.current.guide);
          else onCancel();
        }}
        onKeyDown={onKeyDown}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[min(60rem,calc(100vw-2rem))] max-w-none flex-col overflow-hidden rounded-xl border border-ink-200 bg-surface p-0 text-ink-900 shadow-xl backdrop:bg-ink-950/50 open:flex"
      >
        <header className="border-b border-ink-200 px-5 py-3.5">
          <h2 id={titleId} title={title} className="truncate text-base font-semibold">
            {title}
          </h2>
          <p className="mt-0.5 text-xs text-ink-500">
            What this checkpoint should and shouldn’t look like. Inspectors open it from the row’s
            guide icon.
          </p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <label htmlFor={descriptionId} className="block text-sm font-medium text-ink-800">
            Description
          </label>
          <textarea
            id={descriptionId}
            value={draft.description}
            maxLength={5000}
            rows={3}
            placeholder="What good looks like, e.g. “Every screw has an unbroken paint mark from head to plate.”"
            onChange={(event) => {
              const description = event.target.value;
              setDraft((current) => ({ ...current, description }));
            }}
            className={clsx(
              INPUT,
              'mt-1.5 [field-sizing:content] max-h-56 min-h-20 resize-y py-2 leading-5',
            )}
          />

          <section aria-labelledby={imagesId} className="mt-7">
            <div className="flex items-baseline justify-between gap-4">
              <h3 id={imagesId} className="text-sm font-medium text-ink-800">
                Reference images
              </h3>
              <span className="text-xs text-ink-500 tabular-nums">
                {draft.images.length} / {MAX_GUIDE_IMAGES}
              </span>
            </div>
            <p className="mt-1 mb-3 text-xs text-ink-500">
              Mark each one Good, Bad or Info. Click an image to draw arrows, boxes and labels on
              it. Paste or drop an image anywhere here to add it.
            </p>
            <AnnotatedPhotos
              photos={draft.images}
              onChange={(photos) =>
                setDraft((current) => ({
                  ...current,
                  images: withVerdicts(photos, current.images),
                }))
              }
              max={MAX_GUIDE_IMAGES}
              label={`Images of the guide for ${rowRef}`}
              noun="image"
              layout="grid"
              acceptAnywhere
              onDirtyChange={setPhotoDirty}
              renderDetails={(_photo, index) => {
                const image = draft.images[index];
                return (
                  image && (
                    <ImageDetails
                      image={image}
                      index={index}
                      onChange={(patch) => patchImage(index, patch)}
                    />
                  )
                );
              }}
            />
          </section>
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-ink-200 px-5 py-3">
          {guide && (
            <Button
              variant="ghost"
              onClick={() => setConfirming('remove')}
              className="-ml-2 text-nok-fg hover:bg-nok-bg hover:text-nok-fg"
            >
              <Trash2 size={16} aria-hidden="true" />
              Remove guide
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" onClick={requestCancel}>
              Cancel
            </Button>
            {/* Unchanged, Save just closes: nothing to put into the draft. */}
            <Button onClick={() => close(changed ? { guide: saved } : null)}>Save</Button>
          </div>
        </footer>
      </dialog>

      {confirming === 'discard' && (
        <ConfirmDialog
          title="Discard your changes?"
          message="Your changes to this guide will be lost."
          confirmLabel="Discard"
          onConfirm={() => {
            setConfirming(null);
            close(null);
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
      {confirming === 'remove' && guide && (
        <ConfirmDialog
          title={`Remove the guide of row ${rowRef}?`}
          message="Its description and images are removed from the draft. Published revisions and the inspections made from them keep theirs."
          confirmLabel="Remove guide"
          onConfirm={() => {
            setConfirming(null);
            close({ guide: undefined });
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </>
  );
}

type ImagePatch = Partial<Pick<GuideImage, 'verdict' | 'caption'>>;

type DetailsProps = {
  image: GuideImage;
  index: number;
  onChange: (patch: ImagePatch) => void;
};

/** Under an image's tile: its verdict and caption. */
function ImageDetails({ image, index, onChange }: DetailsProps) {
  return (
    <div className="mt-2 space-y-1.5">
      <VerdictPicker
        label={`Verdict, image ${index + 1}`}
        value={image.verdict}
        onChange={(verdict) => onChange({ verdict })}
      />
      <input
        aria-label={`Caption, image ${index + 1}`}
        value={image.caption ?? ''}
        maxLength={500}
        placeholder="Caption"
        onChange={(event) => onChange({ caption: event.target.value })}
        className={clsx(INPUT, 'h-8 px-2.5 text-xs pointer-coarse:h-10')}
      />
    </div>
  );
}
