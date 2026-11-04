import { Mountain } from 'lucide-react';
import { PhotoField, PhotoFrame } from '../../components/PhotoField';

const NOUN = 'machine photo';

/**
 * The machine photo in the front page's 4:3 frame, read-only. Without one, a phone (where the
 * frame would be an empty box the width of the screen, with nothing left to add) says so in a
 * line; wider, the empty frame stays beside the details, as on the printed front page.
 */
export function MachinePhoto({ imageId }: { imageId?: string }) {
  if (imageId) return <PhotoFrame imageId={imageId} noun={NOUN} />;
  return (
    <>
      <p className="flex items-center gap-2 text-sm text-ink-500 sm:hidden">
        <Mountain size={16} strokeWidth={1.5} aria-hidden="true" className="text-ink-400" />
        No {NOUN}
      </p>
      <div className="hidden sm:block">
        <PhotoFrame noun={NOUN} />
      </div>
    </>
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

/** The machine photo with Add / Replace / Remove. */
export function MachinePhotoField({ imageId, defaultImageId, onChange, onUpload }: FieldProps) {
  return (
    <PhotoField
      imageId={imageId}
      noun={NOUN}
      labels={{
        add: 'Add photo',
        replace: 'Replace photo',
        remove: defaultImageId ? 'Use the template’s photo' : 'Remove',
      }}
      defaultImageId={defaultImageId}
      defaultHint="The template’s cover photo"
      onChange={onChange}
      onUpload={onUpload}
    />
  );
}
