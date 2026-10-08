import type { AnnotatedImage } from '@modig/shared';
import clsx from 'clsx';
import { ImageOff, ImagePlus, LoaderCircle, X } from 'lucide-react';
import {
  lazy,
  Suspense,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type ReactNode,
} from 'react';
import { flushSync } from 'react-dom';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useImageUrl } from '../../lib/images';
import type { EditorSubject } from './AnnotationEditor';
import { EditorLoadBoundary } from './EditorLoadBoundary';
import { firstImageFile, shownImageId } from './photos';
import { PhotoViewer } from './PhotoViewer';
import { startUpload } from './upload';

/** The editor brings Konva along, so it is loaded only where photos can be edited. */
const loadEditor = () => import('./AnnotationEditor');
const AnnotationEditor = lazy(() =>
  loadEditor().then((module) => ({ default: module.AnnotationEditor })),
);

/** Deviation evidence is "photos"; a guide's reference pictures are "images" (brief §5.4, §6). */
const WORDS = {
  photo: { name: 'photo', title: 'Photo', notOne: 'That isn’t a photo. Drop a JPEG or PNG image.' },
  image: { name: 'image', title: 'Image', notOne: 'That isn’t an image. Drop a JPEG or PNG file.' },
} as const;
type Words = (typeof WORDS)[keyof typeof WORDS];

type Props = {
  photos: AnnotatedImage[];
  /** Omit for read-only: a photo then opens in a viewer. */
  onChange?: (photos: AnnotatedImage[]) => void;
  /** At most this many photos (no limit when omitted). */
  max?: number;
  /** Names the photos for screen readers and in the editor, e.g. "Photos of D-03". */
  label: string;
  /** What the texts call one of them: "photo" (default) or "image". */
  noun?: keyof typeof WORDS;
  /** 160 px tiles in a wrapping row (default), or tiles that fill a responsive grid. */
  layout?: 'row' | 'grid';
  /** What goes under a thumbnail: its caption by default (a guide image adds its verdict). */
  renderDetails?: (photo: AnnotatedImage, index: number) => ReactNode;
  /**
   * Paste and drop anywhere in the window, not just on this list: for a dialog that is about
   * these photos (the guide editor). Files dropped while it can't take them are ignored.
   */
  acceptAnywhere?: boolean;
  /** The open editor has marks or a caption not saved yet (for the page's leave guard). */
  onDirtyChange?: (dirty: boolean) => void;
};

/** The photo open in the editor: its place in the list (null while it is being added). */
type Editing = { index: number | null; subject: EditorSubject };

/**
 * Photos with arrows, boxes and labels drawn on them (deviation evidence, guide images):
 * thumbnails, and **Add photo** by file picker (camera on a tablet), paste or drag and drop. A new
 * photo opens in the annotation editor straight away; a click on a thumbnail edits it again.
 */
export function AnnotatedPhotos({
  photos,
  onChange,
  max = Infinity,
  label,
  noun = 'photo',
  layout = 'row',
  renderDetails,
  acceptAnywhere = false,
  onDirtyChange,
}: Props) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const words = WORDS[noun];
  const editable = onChange !== undefined;
  const full = photos.length >= max;
  // Paste and drop only add photos while no dialog of this list is open.
  const accepting = editable && editing === null && removing === null;

  // Fetch the editor in the background, so it opens at once when a photo is added. If that
  // fails (offline), opening it tries again and EditorLoadBoundary reports it.
  useEffect(() => {
    if (editable) loadEditor().catch(() => undefined);
  }, [editable]);

  // A paste or drop from elsewhere in a dialog may be refused out of view: show why.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: 'nearest' });
  }, [error]);

  // A new photo's local copy is shown only while its editor is open.
  useEffect(() => {
    if (editing?.subject.kind !== 'new') return;
    const { src } = editing.subject;
    return () => URL.revokeObjectURL(src);
  }, [editing]);

  // Window-wide paste and drop (`acceptAnywhere`); what this list's own area takes is already
  // handled (default prevented) when the event gets here.
  const onWindowPaste = useEffectEvent((event: globalThis.ClipboardEvent) => {
    const file =
      accepting && !event.defaultPrevented && firstImageFile(event.clipboardData?.files ?? []);
    if (!file) return;
    event.preventDefault();
    add(file);
  });
  const onWindowDrag = useEffectEvent((event: globalThis.DragEvent) => {
    const transfer = event.dataTransfer;
    if (event.defaultPrevented || !transfer?.types.includes('Files')) return;
    // Never let the browser open a dropped file in place of the app.
    event.preventDefault();
    if (event.type === 'dragover') {
      transfer.dropEffect = accepting ? 'copy' : 'none';
      setDragging(accepting);
    } else {
      setDragging(false);
      if (accepting) addDropped(transfer.files);
    }
  });
  useEffect(() => {
    if (!acceptAnywhere) return;
    const paste = (event: globalThis.ClipboardEvent) => onWindowPaste(event);
    const drag = (event: globalThis.DragEvent) => onWindowDrag(event);
    // Leaving the window (no element to go to) ends the highlight.
    const leave = (event: globalThis.DragEvent) => {
      if (!event.relatedTarget) setDragging(false);
    };
    window.addEventListener('paste', paste);
    window.addEventListener('dragover', drag);
    window.addEventListener('drop', drag);
    window.addEventListener('dragleave', leave);
    return () => {
      window.removeEventListener('paste', paste);
      window.removeEventListener('dragover', drag);
      window.removeEventListener('drop', drag);
      window.removeEventListener('dragleave', leave);
    };
  }, [acceptAnywhere]);

  if (!editable && photos.length === 0) return null;

  function add(file: File) {
    if (full) {
      setError(`Up to ${max} ${words.name}s. Remove one to add another.`);
      return;
    }
    setError(null);
    setEditing({
      index: null,
      subject: { kind: 'new', src: URL.createObjectURL(file), upload: startUpload(file) },
    });
  }

  function addDropped(files: FileList) {
    const file = firstImageFile(files);
    if (file) add(file);
    else setError(words.notOne);
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
    addDropped(event.dataTransfer.files);
  }

  function onPaste(event: ClipboardEvent<HTMLDivElement>) {
    // Pasted text is left alone; only an image adds a photo.
    const file = accepting ? firstImageFile(event.clipboardData.files) : null;
    if (!file) return;
    event.preventDefault();
    add(file);
  }

  const tile = layout === 'row' ? 'w-40' : 'min-w-0';
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
      <ul
        ref={listRef}
        aria-label={label}
        className={clsx(
          layout === 'row'
            ? 'flex flex-wrap gap-3'
            : 'grid grid-cols-[repeat(auto-fill,minmax(11.5rem,1fr))] gap-x-4 gap-y-5',
        )}
      >
        {photos.map((photo, index) => (
          <Thumbnail
            key={`${index}-${photo.imageId}`}
            photo={photo}
            index={index}
            words={words}
            className={tile}
            action={editable ? 'Edit' : 'View'}
            onOpen={() =>
              editable
                ? setEditing({ index, subject: { kind: 'stored', photo } })
                : setViewing(index)
            }
            onRemove={editable ? () => setRemoving(index) : undefined}
            details={renderDetails?.(photo, index)}
          />
        ))}
        {editable && !full && (
          <li className={tile}>
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
              <span className="text-xs font-medium">Add {words.name}</span>
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
        <p ref={errorRef} role="alert" className="mt-2 text-xs font-medium text-nok-fg">
          {error}
        </p>
      )}

      {editing && (
        <EditorLoadBoundary onClose={() => setEditing(null)}>
          <Suspense fallback={<EditorLoading />}>
            <AnnotationEditor
              title={
                editing.index === null ? `New ${words.name}` : `${words.title} ${editing.index + 1}`
              }
              label={label}
              subject={editing.subject}
              onSave={save}
              onCancel={() => setEditing(null)}
              onDirtyChange={onDirtyChange}
            />
          </Suspense>
        </EditorLoadBoundary>
      )}
      {viewing !== null && photos[viewing] && (
        <PhotoViewer
          photo={photos[viewing]}
          title={`${words.title} ${viewing + 1}`}
          label={label}
          onClose={() => setViewing(null)}
        />
      )}
      {removing !== null && (
        <ConfirmDialog
          title={`Remove ${words.name} ${removing + 1}?`}
          message={`The ${words.name} and what was drawn on it are removed.`}
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
  words: Words;
  className: string;
  action: 'Edit' | 'View';
  onOpen: () => void;
  onRemove?: () => void;
  /** Replaces the caption under the tile. */
  details: ReactNode;
};

/** A photo as a 4:3 tile (its flattened copy when it has marks), with its caption under it. */
function Thumbnail({
  photo,
  index,
  words,
  className,
  action,
  onOpen,
  onRemove,
  details,
}: ThumbnailProps) {
  const url = useImageUrl(shownImageId(photo));
  const name = `${action} ${words.name} ${index + 1}`;
  return (
    <li className={className} data-photo={index}>
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
            aria-label={`Remove ${words.name} ${index + 1}`}
            title={`Remove ${words.name} ${index + 1}`}
            className="absolute top-1 right-1 flex size-7 items-center justify-center rounded-full bg-ink-950/65 text-white transition-colors hover:bg-ink-950/85"
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      {details ??
        (photo.caption && (
          <p className="mt-1 truncate text-xs text-ink-600" title={photo.caption}>
            {photo.caption}
          </p>
        ))}
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
