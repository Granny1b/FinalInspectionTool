import { uploadImage } from '../../lib/images';

/** A new photo uploading while it is annotated. */
export type PendingUpload = {
  /** The current attempt: the photo's id, or its failure. */
  result: () => Promise<string>;
  /** The same, but a failed attempt is started again. */
  retry: () => Promise<string>;
};

/**
 * Starts scaling and uploading a new photo at once, so it is usually done before Save. An attempt
 * that hangs times out (lib/images), so `retry` can start a new one.
 */
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
