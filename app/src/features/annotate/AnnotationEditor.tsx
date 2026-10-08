import type { AnnotatedImage } from '@modig/shared';
import clsx from 'clsx';
import { ImageOff, LoaderCircle } from 'lucide-react';
import { useEffect, useId, useReducer, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { INPUT } from '../../components/Field';
import { ApiRequestError, errorMessage } from '../../lib/api';
import { fitWithin, ImageError, useImageUrl } from '../../lib/images';
import { AnnotationCanvas } from './AnnotationCanvas';
import { editorCommand } from './commands';
import {
  annotationsOf,
  editorReducer,
  initialEditorState,
  sameAnnotations,
  type EditorAction,
} from './editorState';
import { EditorToolbar } from './EditorToolbar';
import { fitInto } from './geometry';
import { canRedo, canUndo } from './history';
import { needsRender, savedPhoto } from './photos';
import { renderAnnotatedJpeg } from './render';
import { defaultTextSize } from './style';
import { TOOL_HINTS } from './tools';
import { uploadJpeg, type PendingUpload } from './upload';
import { useElementSize, useLoadedImage } from './useLoadedImage';

/** The photo being annotated: one already stored, or a new one that uploads meanwhile. */
export type EditorSubject =
  | { kind: 'stored'; photo: AnnotatedImage }
  | {
      kind: 'new';
      /** A local (object) URL of the picked file, shown while it uploads. */
      src: string;
      upload: PendingUpload;
    };

type Props = {
  /** "Photo 2", or "New photo". */
  title: string;
  /** What the photos belong to, under the title. */
  label: string;
  subject: EditorSubject;
  onSave: (photo: AnnotatedImage) => void;
  onCancel: () => void;
};

/**
 * The annotation editor (brief §5.4): tools on top, the photo filling the window, the caption and
 * Save / Cancel at the bottom. Saving stores the marks as vectors (fractions of the photo) and,
 * when there are marks, a flattened JPEG of the photo with them at its full resolution for
 * thumbnails and print. Escape cancels, asking first when something would be lost.
 */
export function AnnotationEditor({ title, label, subject, onSave, onCancel }: Props) {
  const initial = subject.kind === 'stored' ? subject.photo : null;
  const [state, dispatch] = useReducer(
    editorReducer,
    initial?.annotations ?? [],
    initialEditorState,
  );
  const [caption, setCaption] = useState(initial?.caption ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [area, setArea] = useState<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  /** What closing the dialog reports: the saved photo, or null for Cancel. */
  const outcome = useRef<AnnotatedImage | null>(null);
  const titleId = useId();
  const captionId = useId();

  const storedUrl = useImageUrl(initial?.imageId);
  const { image, failed } = useLoadedImage(
    subject.kind === 'stored' ? storedUrl.data : subject.src,
  );
  const areaSize = useElementSize(area);
  // A new photo is stored scaled down to at most 1600 px; the flattened copy matches it.
  const size = image ? fitWithin({ width: image.naturalWidth, height: image.naturalHeight }) : null;
  const shown = size && fitInto(size, areaSize);
  const items = state.history.present;
  const annotations = annotationsOf(state);
  // The picker shows the selected mark's colour; picking another recolours it.
  const selectedColor = items.find((item) => item.id === state.selectedId)?.annotation.color;
  const dirty =
    !sameAnnotations(annotations, initial?.annotations ?? []) ||
    caption.trim() !== (initial?.caption ?? '');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    // The dialog itself takes the focus, not its first tool button (whose focus ring read as a
    // second selected tool). The shortcuts work from there; Tab goes on to the tools.
    dialog.focus();
  }, []);

  // A new photo's upload runs while it is annotated; say at once if it failed.
  useEffect(() => {
    if (subject.kind !== 'new') return;
    let current = true;
    subject.upload.result().catch((failure: unknown) => {
      if (current) setError(failureMessage(failure));
    });
    return () => {
      current = false;
    };
  }, [subject]);

  // Closing or reloading the tab would lose the marks: the browser asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function close(saved: AnnotatedImage | null) {
    outcome.current = saved;
    // Closed through the dialog, so the focus goes back to whatever opened it.
    dialogRef.current?.close();
  }

  function requestCancel() {
    if (saving) return;
    if (dirty) setConfirming(true);
    else close(null);
  }

  async function save() {
    if (!image || !size || saving) return;
    setSaving(true);
    setError(null);
    try {
      const imageId =
        subject.kind === 'stored' ? subject.photo.imageId : await subject.upload.retry();
      const renderedImageId = needsRender(initial, annotations)
        ? await uploadJpeg(await renderAnnotatedJpeg(image, size, annotations))
        : initial?.renderedImageId;
      close(savedPhoto({ imageId, caption, annotations, renderedImageId }));
    } catch (failure) {
      setError(failureMessage(failure));
      setSaving(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    // The page behind the modal never sees its keys (a checklist row would take "1" as OK).
    event.stopPropagation();
    if (event.key === 'Escape') {
      // Handled here, not by the dialog: Chrome refuses only one Escape per click, so a
      // prevented `cancel` would not keep the editor open on a second press.
      event.preventDefault();
      requestCancel();
      return;
    }
    // In the caption or a label, keys are text (and Ctrl+Z is the field's own undo).
    if (saving || event.target instanceof HTMLInputElement) return;
    const command = editorCommand(event);
    if (!command) return;
    event.preventDefault();
    dispatch({ type: command });
  }

  const act = (action: EditorAction) => {
    if (!saving) dispatch(action);
  };

  return (
    <>
      <dialog
        ref={dialogRef}
        tabIndex={-1}
        aria-labelledby={titleId}
        data-annotation-editor=""
        closedby="none"
        onCancel={(event) => event.preventDefault()}
        onClose={() => (outcome.current ? onSave(outcome.current) : onCancel())}
        onKeyDown={onKeyDown}
        className="m-auto h-[calc(100dvh-2rem)] max-h-none w-[min(80rem,calc(100vw-2rem))] max-w-none overflow-hidden rounded-xl border border-ink-200 bg-surface p-0 text-ink-900 shadow-xl outline-none backdrop:bg-ink-950/50"
      >
        <div className="flex h-full flex-col">
          <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-ink-200 px-4 py-2">
            <div className="min-w-0">
              <h2 id={titleId} className="truncate text-sm font-semibold text-ink-900">
                {title}
              </h2>
              <p className="truncate text-xs text-ink-500">{label}</p>
            </div>
            <EditorToolbar
              tool={state.tool}
              color={state.text?.color ?? selectedColor ?? state.color}
              canUndo={canUndo(state.history)}
              canRedo={canRedo(state.history)}
              canDelete={state.selectedId !== null}
              disabled={saving}
              onTool={(tool) => act({ type: 'tool', tool })}
              onColor={(color) => act({ type: 'color', color })}
              onUndo={() => act({ type: 'undo' })}
              onRedo={() => act({ type: 'redo' })}
              onDelete={() => act({ type: 'delete' })}
            />
          </header>

          <div className="flex min-h-0 flex-1 flex-col bg-ink-900">
            <div ref={setArea} className="flex min-h-0 flex-1 items-center justify-center p-4">
              {image && size && shown ? (
                <AnnotationCanvas
                  image={image}
                  size={size}
                  shown={shown}
                  items={items}
                  tool={state.tool}
                  color={state.color}
                  selectedId={state.selectedId}
                  text={state.text}
                  disabled={saving}
                  onSelect={(id) => act({ type: 'select', id })}
                  onAdd={(annotation) => act({ type: 'add', annotation })}
                  onMove={(id, dx, dy) => act({ type: 'move', id, dx, dy })}
                  onPlaceText={(at) => act({ type: 'text-start', at, size: defaultTextSize(size) })}
                  onEditText={(id) => act({ type: 'text-edit', id })}
                  onTextChange={(value) => dispatch({ type: 'text-change', value })}
                  onTextCommit={() => dispatch({ type: 'text-commit' })}
                  onTextCancel={() => dispatch({ type: 'text-cancel' })}
                />
              ) : failed || storedUrl.isError ? (
                <p className="flex items-center gap-2 text-sm text-ink-200">
                  <ImageOff size={18} aria-hidden="true" />
                  The photo couldn’t be loaded. Close the editor and try again.
                </p>
              ) : (
                <LoaderCircle
                  size={22}
                  aria-label="Loading photo"
                  className="animate-spin text-ink-300"
                />
              )}
            </div>
            <p className="px-4 pb-2.5 text-center text-xs text-ink-300">{TOOL_HINTS[state.tool]}</p>
          </div>

          <footer className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-ink-200 px-4 py-3">
            <label htmlFor={captionId} className="sr-only">
              Caption
            </label>
            <input
              id={captionId}
              value={caption}
              maxLength={500}
              placeholder="Caption (optional)"
              disabled={saving}
              onChange={(event) => setCaption(event.target.value)}
              className={clsx(INPUT, 'h-9 min-w-0 flex-1 basis-64')}
            />
            {error && (
              <p role="alert" className="text-xs font-medium text-nok-fg">
                {error}
              </p>
            )}
            <div className="ml-auto flex gap-2">
              <Button variant="secondary" onClick={requestCancel} disabled={saving}>
                Cancel
              </Button>
              {/* aria-disabled while saving: a disabled button would drop the keyboard focus. */}
              <Button
                onClick={() => void save()}
                disabled={!image}
                aria-disabled={saving || undefined}
                className="min-w-20 aria-disabled:opacity-70"
              >
                {saving && <LoaderCircle size={15} aria-hidden="true" className="animate-spin" />}
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </footer>
        </div>
      </dialog>
      {confirming && (
        <ConfirmDialog
          title={initial ? 'Discard your changes?' : 'Discard this photo?'}
          message={
            initial
              ? 'Your changes to the marks and the caption will be lost.'
              : 'The photo isn’t added, and what you drew on it will be lost.'
          }
          confirmLabel="Discard"
          onConfirm={() => {
            setConfirming(false);
            close(null);
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}

function failureMessage(failure: unknown): string {
  if (failure instanceof ImageError || failure instanceof ApiRequestError) return failure.message;
  // fetch() rejects with a TypeError when the network is down.
  if (failure instanceof TypeError) return errorMessage(failure);
  return 'Couldn’t save the marked-up photo. Try again.';
}
