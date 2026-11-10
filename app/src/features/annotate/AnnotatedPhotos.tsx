import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DndContextProps,
  type DragEndEvent,
  type KeyboardSensorOptions,
  type PointerSensorOptions,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { AnnotatedImage } from '@modig/shared';
import clsx from 'clsx';
import { GripVertical, ImageOff, ImagePlus, LoaderCircle, X } from 'lucide-react';
import {
  lazy,
  Suspense,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type CSSProperties,
  type DragEvent,
  type ReactNode,
} from 'react';
import { flushSync } from 'react-dom';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useImageUrl } from '../../lib/images';
import type { EditorSubject } from './AnnotationEditor';
import { EditorLoadBoundary } from './EditorLoadBoundary';
import { canDecode, firstImageFile, pastesText, photoKeys, shownImageId } from './photos';
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
  /** A quality check's pictures of how a checkpoint should and should not look. */
  picture: {
    name: 'picture',
    title: 'Picture',
    notOne: 'That isn’t a picture. Drop a JPEG or PNG file.',
  },
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
  /**
   * Each tile gets a handle that drags it to another place (the guide editor's pictures): with a
   * mouse or a finger, or Space and the arrow keys. While one is moved, the list's root carries
   * `data-sorting`, so a dialog around it leaves its keys (Escape cancels the move) alone.
   */
  reorderable?: boolean;
};

/** A few pixels of movement before a drag starts, so a press on a handle stays a press. */
const POINTER_OPTIONS: PointerSensorOptions = { activationConstraint: { distance: 4 } };
const KEYBOARD_OPTIONS: KeyboardSensorOptions = { coordinateGetter: sortableKeyboardCoordinates };

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
  reorderable = false,
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
  // One photo has no other place to go.
  const sortable = editable && reorderable && photos.length > 1;
  const keys = useMemo(() => photoKeys(photos), [photos]);
  // Set on the list's root the moment a move starts, not after React re-renders: a dialog around
  // it must leave the very next key (an arrow, Escape) to the move.
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const setSorting = (on: boolean) => {
    if (on) root?.setAttribute('data-sorting', '');
    else root?.removeAttribute('data-sorting');
  };
  const sensors = useSensors(
    useSensor(PointerSensor, POINTER_OPTIONS),
    useSensor(KeyboardSensor, KEYBOARD_OPTIONS),
  );
  // What a screen reader hears while a photo is moved: places, not image ids.
  const accessibility = useMemo<DndContextProps['accessibility']>(() => {
    const place = (id: UniqueIdentifier) => keys.indexOf(String(id)) + 1;
    const announcements: Announcements = {
      onDragStart: ({ active }) => `Picked up ${words.name} ${place(active.id)}.`,
      onDragOver: ({ active, over }) =>
        over
          ? `${words.title} ${place(active.id)} is over place ${place(over.id)} of ${keys.length}.`
          : `${words.title} ${place(active.id)} is not over a place.`,
      onDragEnd: ({ active, over }) =>
        over
          ? `${words.title} ${place(active.id)} moved to place ${place(over.id)} of ${keys.length}.`
          : `${words.title} ${place(active.id)} is back in its place.`,
      onDragCancel: ({ active }) =>
        `Moving cancelled. ${words.title} ${place(active.id)} is back in its place.`,
    };
    return {
      announcements,
      // In the list, not at the end of <body>: in a modal dialog (the guide editor) everything
      // outside it is hidden from screen readers, announcements too.
      container: root ?? undefined,
      screenReaderInstructions: {
        draggable: `To move a ${words.name}, press Space or Enter on its handle, move it with the arrow keys, then press Space or Enter to drop it, or Escape to cancel.`,
      },
    };
  }, [keys, words, root]);

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
      accepting &&
      !event.defaultPrevented &&
      !pastesText(event) &&
      firstImageFile(event.clipboardData?.files ?? []);
    if (!file) return;
    event.preventDefault();
    void add(file);
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
      if (accepting) void addDropped(transfer.files);
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

  async function add(file: File) {
    if (full) {
      setError(`Up to ${max} ${words.name}s. Remove one to add another.`);
      return;
    }
    // One the browser can't draw (HEIC in Chrome, SVG) could never be saved: say so at once.
    if (!(await canDecode(file))) {
      setError(words.notOne);
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
    if (file) void add(file);
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
      // "Up to 6 images" no longer applies.
      setError(null);
      onChange?.(photos.toSpliced(index, 1));
    });
    addRef.current?.focus();
  }

  /** A photo dropped in another place: the list in its new order. */
  function onSortEnd({ active, over }: DragEndEvent) {
    setSorting(false);
    const from = keys.indexOf(String(active.id));
    const to = over ? keys.indexOf(String(over.id)) : -1;
    if (from < 0 || to < 0 || from === to) return;
    onChange?.(arrayMove(photos, from, to));
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
    // Pasted text is left alone, also text pasted into a field that comes with a picture of
    // itself; only an image adds a photo.
    const file = accepting && !pastesText(event) ? firstImageFile(event.clipboardData.files) : null;
    if (!file) return;
    event.preventDefault();
    void add(file);
  }

  const tile = layout === 'row' ? 'w-40' : 'min-w-0';
  const thumbnailProps = (photo: AnnotatedImage, index: number): ThumbnailProps => ({
    photo,
    index,
    words,
    className: tile,
    action: editable ? 'Edit' : 'View',
    onOpen: () =>
      editable ? setEditing({ index, subject: { kind: 'stored', photo } }) : setViewing(index),
    onRemove: editable ? () => setRemoving(index) : undefined,
    details: renderDetails?.(photo, index),
  });
  const tiles = photos.map((photo, index) =>
    sortable ? (
      <SortableThumbnail key={keys[index]} id={keys[index]!} {...thumbnailProps(photo, index)} />
    ) : (
      <Thumbnail key={`${index}-${photo.imageId}`} {...thumbnailProps(photo, index)} />
    ),
  );
  return (
    <div
      ref={setRoot}
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
        {sortable ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            accessibility={accessibility}
            onDragStart={() => setSorting(true)}
            onDragEnd={onSortEnd}
            onDragCancel={() => setSorting(false)}
          >
            <SortableContext items={keys} strategy={rectSortingStrategy}>
              {tiles}
            </SortableContext>
          </DndContext>
        ) : (
          tiles
        )}
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
            if (file) void add(file);
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

/** A tile that can be dragged to another place by its handle. */
function SortableThumbnail({ id, ...props }: ThumbnailProps & { id: string }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  return (
    <Thumbnail
      {...props}
      tileRef={setNodeRef}
      // Lifted over the others while it moves.
      tileStyle={{
        transform: CSS.Translate.toString(transform),
        transition,
        ...(isDragging && { position: 'relative', zIndex: 10 }),
      }}
      dragging={isDragging}
      handleRef={setActivatorNodeRef}
      handleProps={{ ...attributes, ...listeners }}
    />
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
  /** In a list that can be reordered (SortableThumbnail): the tile's place and its handle. */
  tileRef?: (node: HTMLElement | null) => void;
  tileStyle?: CSSProperties;
  dragging?: boolean;
  handleRef?: (node: HTMLElement | null) => void;
  /** Present when the tile can be moved: it then has a drag handle. */
  handleProps?: Record<string, unknown>;
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
  tileRef,
  tileStyle,
  dragging = false,
  handleRef,
  handleProps,
}: ThumbnailProps) {
  const url = useImageUrl(shownImageId(photo));
  const name = `${action} ${words.name} ${index + 1}`;
  return (
    <li
      ref={tileRef}
      style={tileStyle}
      className={clsx(
        className,
        dragging && 'rounded-md bg-overlay shadow-lg ring-2 ring-brand-500',
      )}
      data-photo={index}
    >
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
        {handleProps && (
          // Top left, as the remove button is top right. Not draggable as a whole, so a click on
          // the photo still opens it and its verdict and caption stay usable.
          <button
            ref={handleRef}
            type="button"
            {...handleProps}
            aria-label={`Move ${words.name} ${index + 1}`}
            title={`Drag to move ${words.name} ${index + 1}`}
            className="absolute top-1 left-1 flex size-7 cursor-grab touch-none items-center justify-center rounded-full bg-scrim/65 text-white transition-colors hover:bg-scrim/85 active:cursor-grabbing"
          >
            <GripVertical size={14} aria-hidden="true" />
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${words.name} ${index + 1}`}
            title={`Remove ${words.name} ${index + 1}`}
            className="absolute top-1 right-1 flex size-7 items-center justify-center rounded-full bg-scrim/65 text-white transition-colors hover:bg-scrim/85"
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
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    // Closed before React removes it, so the focus goes back to the opener (which the editor
    // then records as its own return target) instead of falling to <body>. A layout effect's
    // cleanup runs while the dialog is still in the page; a passive one would be too late.
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={dialogRef}
      aria-label="Opening the photo editor"
      closedby="none"
      className="m-auto rounded-xl border border-ink-200 bg-overlay p-6 shadow-xl backdrop:bg-scrim/30 dark:border-ink-300 dark:backdrop:bg-scrim/70"
    >
      <LoaderCircle size={22} aria-hidden="true" className="animate-spin text-ink-400" />
    </dialog>
  );
}
