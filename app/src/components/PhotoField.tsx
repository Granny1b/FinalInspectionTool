import { ImageOff, ImagePlus, LoaderCircle, Mountain, Trash2 } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { errorMessage } from '../lib/api';
import { ImageError, uploadImage, useImageUrl } from '../lib/images';
import { Button } from './Button';

type FrameProps = {
  imageId?: string;
  /** What the photo is, as in "No cover photo"; capitalised, it is the image's alt text. */
  noun: string;
  children?: ReactNode;
};

/** A front page's photo (template cover, machine photo) in a 4:3 frame, or a placeholder. */
export function PhotoFrame({ imageId, noun, children }: FrameProps) {
  const url = useImageUrl(imageId);
  return (
    <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border border-ink-200 bg-ink-50">
      {!imageId ? (
        <div className="flex flex-col items-center gap-1.5 text-xs text-ink-500">
          <Mountain size={22} strokeWidth={1.5} aria-hidden="true" className="text-ink-400" />
          No {noun}
        </div>
      ) : url.data ? (
        <img
          src={url.data}
          alt={noun.charAt(0).toUpperCase() + noun.slice(1)}
          className="size-full bg-surface object-contain"
        />
      ) : url.isError ? (
        <div className="flex flex-col items-center gap-1.5 px-4 text-center text-xs text-ink-500">
          <ImageOff size={20} strokeWidth={1.5} aria-hidden="true" className="text-ink-400" />
          The photo couldn’t be loaded.
        </div>
      ) : (
        <LoaderCircle size={20} aria-label="Loading photo" className="animate-spin text-ink-400" />
      )}
      {children}
    </div>
  );
}

type FieldProps = {
  /** The document's own photo. */
  imageId: string | undefined;
  noun: string;
  /** Button labels: add (no photo shown), replace, remove. */
  labels: { add: string; replace: string; remove: string };
  /** Shown while `imageId` is unset, with `defaultHint` under it (a new inspection's cover). */
  defaultImageId?: string;
  defaultHint?: string;
  onChange: (imageId: string | undefined) => void;
  /** An upload has started; the promise settles once it is done (or failed). */
  onUpload: (upload: Promise<void>) => void;
};

/** The photo with Add / Replace / Remove, resized and uploaded through `uploadImage`. */
export function PhotoField({
  imageId,
  noun,
  labels,
  defaultImageId,
  defaultHint,
  onChange,
  onUpload,
}: FieldProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLButtonElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shown = imageId ?? defaultImageId;

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      onChange(await uploadImage(file));
    } catch (failure) {
      setError(failure instanceof ImageError ? failure.message : errorMessage(failure));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <PhotoFrame imageId={shown} noun={noun}>
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-surface/80 text-sm font-medium text-ink-700">
            <LoaderCircle size={16} aria-hidden="true" className="animate-spin" />
            Uploading…
          </div>
        )}
      </PhotoFrame>
      {!imageId && defaultImageId && defaultHint && (
        <p className="mt-1.5 text-xs text-ink-500">{defaultHint}</p>
      )}
      <div className="mt-2.5 flex flex-wrap gap-2">
        {/* aria-disabled, not disabled: a disabled button would drop the keyboard focus. */}
        <Button
          ref={pickRef}
          variant="secondary"
          className="h-8 px-2.5 aria-disabled:opacity-50"
          aria-disabled={uploading || undefined}
          onClick={() => {
            if (!uploading) fileRef.current?.click();
          }}
        >
          <ImagePlus size={15} aria-hidden="true" />
          {shown ? labels.replace : labels.add}
        </Button>
        {imageId && (
          <Button
            variant="ghost"
            className="h-8 px-2.5"
            disabled={uploading}
            onClick={() => {
              onChange(undefined);
              // This button disappears; the focus goes to the add / replace button.
              pickRef.current?.focus();
            }}
          >
            <Trash2 size={15} aria-hidden="true" />
            {labels.remove}
          </Button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared so picking the same file again still fires onChange.
          event.target.value = '';
          if (file) onUpload(upload(file));
        }}
      />
      {error && (
        <p role="alert" className="mt-2 text-xs font-medium text-nok-fg">
          {error}
        </p>
      )}
    </div>
  );
}
