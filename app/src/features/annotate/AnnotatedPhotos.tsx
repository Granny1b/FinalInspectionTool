import type { AnnotatedImage } from '@modig/shared';
import clsx from 'clsx';
import { ImageOff, ImagePlus, LoaderCircle, X } from 'lucide-react';
import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
} from 'react';
import { flushSync } from 'react-dom';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useImageUrl } from '../../lib/images';
import type { EditorSubject } from './AnnotationEditor';
import { firstImageFile, shownImageId } from './photos';
import { PhotoViewer } from './PhotoViewer';
import { startUpload } from './upload';

/** The editor brings Konva along, so it is loaded only where photos can be edited. */
const loadEditor = () => import('./AnnotationEditor');
const AnnotationEditor = lazy(() =>
  loadEditor().then((module) => ({ default: module.AnnotationEditor })),
);

type Props = {
  photos: AnnotatedImage[];
  /** Omit for read-only: a photo then opens in a viewer. */
  onChange?: (photos: AnnotatedImage[]) => void;
  /** At most this many photos (no limit when omitted). */
  max?: number;
  /** Names the photos for screen readers and in the editor, e.g. "Photos of D-03". */
  label: string;
};

/** The photo open in the editor: its place in the list (null while it is being added). */
type Editing = { index: number | null; subject: EditorSubject };

/**
 * Photos with arrows, boxes and labels drawn on them (deviation evidence, later guide images):
 * thumbnails, and **Add photo** by file picker (camera on a tablet), paste or drag and drop. A new
 * photo opens in the annotation editor straight away; a click on a thumbnail edits it again.
 */
export function AnnotatedPhotos({ photos, onChange, max = Infinity, label }: Props) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const editable = onChange !== undefined;
  const full = photos.length >= max;
  // Paste and drop only add photos while no dialog of this list is open.
  const accepting = editable && editing === null && removing === null;

  // Fetch the editor in the background, so it opens at once when a photo is added. If that
  // fails (offline), opening it tries again and the page's error screen reports it.
  useEffect(() => {
    if (editable) loadEditor().catch(() => undefined);
  }, [editable]);

  // A new photo's local copy is shown only while its editor is open.
  useEffect(() => {
    if (editing?.subject.kind !== 'new') return;
    const { src } = editing.subject;
    return () => URL.revokeObjectURL(src);
  }, [editing]);

  if (!editable && photos.length === 0) return null;

  function add(file: File) {
    if (full) {
      setError(`Up to ${max} photos. Remove one to add another.`);
      return;
    }
    setError(null);
    setEditing({
      index: null,
      subject: { kind: 'new', src: URL.createObjectURL(file), upload: startUpload(file) },
    });
  }

  function save(photo: AnnotatedImage) {
    if (!onChange || !editing) return;
    const index = editing.index ?? photos.length;
    // Rendered at once, so the new thumbnail can take the focus (the Add button may be gone).
    flushSync(() => {
      setEditing(null);
      onChange(photos.toSpliced(index, editing.index === null ? 0 : 1, photo));
    });
    listRef.current?.querySelector<HTMLElement>(`[data-photo="${index}"] button`)?.focus();
  }

  function remove(index: number) {
    flushSync(() => {
      setRemoving(null);
      onChange?.(photos.toSpliced(index, 1));
    });
    addRef.current?.focus();
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    if (!accepting || !event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDragging(true);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    if (!accepting || !event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    setDragging(false);
    const file = firstImageFile(event.dataTransfer.files);
    if (file) add(file);
    else setError('That isn’t a photo. Drop a JPEG or PNG image.');
  }

  function onPaste(event: ClipboardEvent<HTMLDivElement>) {
    // Pasted text is left alone; only an image adds a photo.
    const file = accepting ? firstImageFile(event.clipboardData.files) : null;
    if (!file) return;
    event.preventDefault();
    add(file);
  }

  return (
    <div
      data-annotated-photos=""
      onDragEnter={onDragOver}
      onDragOver={onDragOver}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={onDrop}
      onPaste={onPaste}
    >
      <ul ref={listRef} aria-label={label} className="flex flex-wrap gap-3">
        {photos.map((photo, index) => (
          <Thumbnail
            key={`${index}-${photo.imageId}`}
            photo={photo}
            index={index}
            action={editable ? 'Edit' : 'View'}
            onOpen={() =>
              editable
                ? setEditing({ index, subject: { kind: 'stored', photo } })
                : setViewing(index)
            }
            onRemove={editable ? () => setRemoving(index) : undefined}
          />
        ))}
        {editable && !full && (
          <li className="w-40">
            <button
              ref={addRef}
              type="button"
              onClick={() => fileRef.current?.click()}
              className={clsx(
                'flex aspect-[4/3] w-full flex-col items-center justify-center gap-0.5 rounded-md border border-dashed transition-colors',
                'hover:border-brand-500 hover:bg-brand-50 hover:text-brand-700',
                dragging
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-ink-400 bg-surface text-ink-700',
              )}
            >
              <ImagePlus size={18} aria-hidden="true" className="mb-0.5" />
              <span className="text-xs font-medium">Add photo</span>
              {/* Paste and drop are for a desktop; a tablet offers its camera in the picker. */}
              <span className="text-[0.6875rem] text-ink-500 pointer-coarse:hidden">
                or drop / paste
              </span>
            </button>
          </li>
        )}
      </ul>
      {editable && (
        <input
          ref={fileRef}
          type="file"
          // Images only; without `capture`, a tablet offers both its camera and its photo library.
          accept="image/*"
          hidden
          data-photo-input=""
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Cleared so that picking the same file again still counts.
            event.target.value = '';
            if (file) add(file);
          }}
        />
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs font-medium text-nok-fg">
          {error}
        </p>
      )}

      {editing && (
        <Suspense fallback={<EditorLoading />}>
          <AnnotationEditor
            title={editing.index === null ? 'New photo' : `Photo ${editing.index + 1}`}
            label={label}
            subject={editing.subject}
            onSave={save}
            onCancel={() => setEditing(null)}
          />
        </Suspense>
      )}
      {viewing !== null && photos[viewing] && (
        <PhotoViewer
          photo={photos[viewing]}
          title={`Photo ${viewing + 1}`}
          label={label}
          onClose={() => setViewing(null)}
        />
      )}
      {removing !== null && (
        <ConfirmDialog
          title={`Remove photo ${removing + 1}?`}
          message="The photo and what was drawn on it are removed."
          confirmLabel="Remove"
          onConfirm={() => remove(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  );
}

type ThumbnailProps = {
  photo: AnnotatedImage;
  index: number;
  action: 'Edit' | 'View';
  onOpen: () => void;
  onRemove?: () => void;
};

/** A photo as a 4:3 tile (its flattened copy when it has marks), with its caption under it. */
function Thumbnail({ photo, index, action, onOpen, onRemove }: ThumbnailProps) {
  const url = useImageUrl(shownImageId(photo));
  const name = `${action} photo ${index + 1}`;
  return (
    <li className="w-40" data-photo={index}>
      <div className="relative">
        <button
          type="button"
          onClick={onOpen}
          aria-label={photo.caption ? `${name}: ${photo.caption}` : name}
          title={name}
          className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md border border-ink-200 bg-ink-50 transition-colors hover:border-ink-400"
        >
          {url.data ? (
            // Same CORS request as the editor's, so the browser can reuse it from its cache.
            <img
              src={url.data}
              crossOrigin="anonymous"
              alt=""
              // Whole, as it prints: marks near an edge must not be cropped away.
              className="size-full bg-surface object-contain"
            />
          ) : url.isError ? (
            <ImageOff size={18} aria-hidden="true" className="text-ink-400" />
          ) : (
            <LoaderCircle size={18} aria-hidden="true" className="animate-spin text-ink-400" />
          )}
        </button>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove photo ${index + 1}`}
            title={`Remove photo ${index + 1}`}
            className="absolute top-1 right-1 flex size-7 items-center justify-center rounded-full bg-ink-950/65 text-white transition-colors hover:bg-ink-950/85"
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      {photo.caption && (
        <p className="mt-1 truncate text-xs text-ink-600" title={photo.caption}>
          {photo.caption}
        </p>
      )}
    </li>
  );
}

/** Shown the first time the editor opens, while its code (with Konva) loads. */
function EditorLoading() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog
      ref={dialogRef}
      aria-label="Opening the photo editor"
      closedby="none"
      className="m-auto rounded-xl border border-ink-200 bg-surface p-6 shadow-xl backdrop:bg-ink-950/50"
    >
      <LoaderCircle size={22} aria-hidden="true" className="animate-spin text-ink-400" />
    </dialog>
  );
}
