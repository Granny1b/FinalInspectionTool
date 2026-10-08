import { ImageUploadUrlResponseSchema } from '@modig/shared';
import { apiFetch } from '../../lib/api';
import { putToStorage, uploadImage } from '../../lib/images';

/**
 * Uploads an already encoded JPEG (a flattened copy) as a new image, as `uploadImage` does for
 * photos but without scaling and re-encoding it, which would blur its lines a second time.
 */
export async function uploadJpeg(jpeg: Blob): Promise<string> {
  const { data } = await apiFetch('/api/images/upload-url', {
    method: 'POST',
    schema: ImageUploadUrlResponseSchema,
  });
  await putToStorage(data.sasUrl, jpeg);
  return data.imageId;
}

/** A new photo uploading while it is annotated. */
export type PendingUpload = {
  /** The current attempt: the photo's id, or its failure. */
  result: () => Promise<string>;
  /** The same, but a failed attempt is started again. */
  retry: () => Promise<string>;
};

/** Starts scaling and uploading a new photo at once, so it is usually done before Save. */
export function startUpload(file: Blob): PendingUpload {
  let failed = false;
  const begin = () => {
    failed = false;
    const attempt = uploadImage(file);
    // Also keeps a failure that nobody waits for from being an unhandled rejection.
    attempt.catch(() => {
      failed = true;
    });
    return attempt;
  };
  let current = begin();
  return {
    result: () => current,
    retry: () => (failed ? (current = begin()) : current),
  };
}
