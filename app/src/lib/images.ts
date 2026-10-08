/**
 * Photos (brief §3): resized in the browser to at most IMAGE_MAX_EDGE_PX on the long edge and
 * re-encoded as JPEG, then PUT straight to blob storage through a short-lived upload URL from the
 * API. They are shown through short-lived read URLs; the storage key never reaches the browser.
 */
import {
  IMAGE_JPEG_QUALITY,
  IMAGE_MAX_EDGE_PX,
  ImageReadUrlResponseSchema,
  ImageUploadUrlResponseSchema,
} from '@modig/shared';
import { queryOptions, skipToken, useQuery } from '@tanstack/react-query';
import { apiFetch } from './api';

/** A failure with a message meant for the user. */
export class ImageError extends Error {
  override name = 'ImageError';
}

export type Size = { width: number; height: number };

/** Scales down (never up) so the long edge is at most `maxEdge`, keeping the aspect ratio. */
export function fitWithin({ width, height }: Size, maxEdge = IMAGE_MAX_EDGE_PX): Size {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Resizes the photo and uploads it; resolves to its image id. */
export async function uploadImage(file: Blob): Promise<string> {
  const jpeg = await toJpeg(file);
  const { data } = await apiFetch('/api/images/upload-url', {
    method: 'POST',
    schema: ImageUploadUrlResponseSchema,
  });
  await putToStorage(data.sasUrl, jpeg);
  return data.imageId;
}

/** Decodes the file (camera orientation applied), scales it down and encodes it as JPEG. */
async function toJpeg(file: Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (cause) {
    throw new ImageError("This file can't be opened as an image. Use a JPEG or PNG photo.", {
      cause,
    });
  }
  try {
    const { width, height } = fitWithin(bitmap);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new ImageError('Your browser could not process the image.');
    // JPEG has no transparency: transparent parts of a PNG would otherwise turn black.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new ImageError('Your browser could not process the image.')),
        'image/jpeg',
        IMAGE_JPEG_QUALITY,
      ),
    );
  } finally {
    bitmap.close();
  }
}

/** PUT to blob storage through the SAS URL: another origin, so plain fetch without cookies. */
export async function putToStorage(sasUrl: string, jpeg: Blob): Promise<void> {
  let res: Response;
  try {
    res = await fetch(sasUrl, {
      method: 'PUT',
      headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': 'image/jpeg' },
      body: jpeg,
      credentials: 'omit',
    });
  } catch (cause) {
    throw new ImageError("Couldn't upload the image. Check your connection and try again.", {
      cause,
    });
  }
  if (!res.ok) throw new ImageError(`Couldn't upload the image (HTTP ${res.status}). Try again.`);
}

/** Read URLs expire after about 15 minutes; a fresh one is fetched before that. */
const READ_URL_STALE_MS = 10 * 60_000;

/** A short-lived URL to show an uploaded image; idle without an id. */
export function useImageUrl(imageId: string | undefined) {
  return useQuery(imageUrlQuery(imageId));
}

/** The query behind useImageUrl, for pages that need several URLs at once (print). */
export function imageUrlQuery(imageId: string | undefined) {
  return queryOptions({
    queryKey: ['images', imageId, 'url'],
    queryFn: imageId
      ? async ({ signal }) =>
          (
            await apiFetch(`/api/images/${encodeURIComponent(imageId)}/url`, {
              schema: ImageReadUrlResponseSchema,
              signal,
            })
          ).data.url
      : skipToken,
    staleTime: READ_URL_STALE_MS,
    gcTime: READ_URL_STALE_MS,
  });
}
