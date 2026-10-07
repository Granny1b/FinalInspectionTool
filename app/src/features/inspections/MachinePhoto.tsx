import { ImageOff, ImagePlus, LoaderCircle, Mountain, Trash2 } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { Button } from '../../components/Button';
import { errorMessage } from '../../lib/api';
import { ImageError, uploadImage, useImageUrl } from '../../lib/images';

/** The machine photo in the front page's 4:3 frame (as the template editor's cover photo). */
export function MachinePhoto({ imageId, children }: { imageId?: string; children?: ReactNode }) {
  const url = useImageUrl(imageId);
  return (
    <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border border-ink-200 bg-ink-50">
      {!imageId ? (
        <div className="flex flex-col items-center gap-1.5 text-xs text-ink-500">
          <Mountain size={22} strokeWidth={1.5} aria-hidden="true" className="text-ink-400" />
          No machine photo
        </div>
      ) : url.data ? (
        <img src={url.data} alt="Machine photo" className="size-full bg-surface object-contain" />
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
  /** The inspection's own photo. */
  imageId: string | undefined;
  /**
   * New inspections only: shown while `imageId` is unset. The template's cover photo, which the
   * server uses when no photo of its own is sent.
   */
  defaultImageId?: string;
  onChange: (imageId: string | undefined) => void;
  /** An upload has started; the promise settles once it is done (or failed). */
  onUpload: (upload: Promise<void>) => void;
};

/** The photo with Add / Replace / Remove, uploaded through the Phase 2 image helpers. */
export function MachinePhotoField({ imageId, defaultImageId, onChange, onUpload }: FieldProps) {
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
      <MachinePhoto imageId={shown}>
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-surface/80 text-sm font-medium text-ink-700">
            <LoaderCircle size={16} aria-hidden="true" className="animate-spin" />
            Uploading…
          </div>
        )}
      </MachinePhoto>
      {!imageId && defaultImageId && (
        <p className="mt-1.5 text-xs text-ink-500">The template’s cover photo</p>
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
          {shown ? 'Replace photo' : 'Add photo'}
        </Button>
        {imageId && (
          <Button
            variant="ghost"
            className="h-8 px-2.5"
            disabled={uploading}
            onClick={() => {
              onChange(undefined);
              // This button disappears; the focus goes to the photo button.
              pickRef.current?.focus();
            }}
          >
            <Trash2 size={15} aria-hidden="true" />
            {defaultImageId ? 'Use the template’s photo' : 'Remove'}
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
