import { PhotoField, PhotoFrame } from '../../components/PhotoField';

const NOUN = 'machine photo';

/** The machine photo in the front page's 4:3 frame, read-only. */
export function MachinePhoto({ imageId }: { imageId?: string }) {
  return <PhotoFrame imageId={imageId} noun={NOUN} />;
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
