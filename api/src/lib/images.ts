/**
 * Images (brief §3): the browser uploads and downloads `images/{imageId}.jpg` directly from blob
 * storage with short-lived SAS URLs, so photos never pass through the functions. SWA managed
 * functions cannot use a managed identity, so the SAS is signed with the account key from the
 * connection string; only the signed URL ever reaches the client.
 */
import { BlobSASPermissions, type BlockBlobClient } from '@azure/storage-blob';
import {
  blobNames,
  CONTAINERS,
  newId,
  type ImageReadUrlResponse,
  type ImageUploadUrlResponse,
} from '@modig/shared';
import { containerClient, ensureStorage } from './storage';

const UPLOAD_MINUTES = 10;
const READ_MINUTES = 15;

/** A new image id and a URL that can create (and, for a retry, overwrite) only that blob. */
export async function createUploadUrl(): Promise<ImageUploadUrlResponse> {
  // The container must exist (and locally, Azurite's CORS rule be set) before the browser PUTs.
  await ensureStorage();
  const imageId = newId();
  const expiresOn = minutesFromNow(UPLOAD_MINUTES);
  const sasUrl = await imageBlob(imageId).generateSasUrl({
    permissions: BlobSASPermissions.parse('cw'),
    expiresOn,
  });
  return { imageId, sasUrl, expiresAt: expiresOn.toISOString() };
}

/** A read-only URL for an existing image, or null if there is no such image. */
export async function createReadUrl(imageId: string): Promise<ImageReadUrlResponse | null> {
  await ensureStorage();
  const blob = imageBlob(imageId);
  if (!(await blob.exists())) return null;
  const expiresOn = minutesFromNow(READ_MINUTES);
  const url = await blob.generateSasUrl({ permissions: BlobSASPermissions.parse('r'), expiresOn });
  return { url, expiresAt: expiresOn.toISOString() };
}

function imageBlob(imageId: string): BlockBlobClient {
  return containerClient(CONTAINERS.images).getBlockBlobClient(blobNames.image(imageId));
}

/** Whole seconds, because that is all a SAS expiry holds: `expiresAt` then matches it exactly. */
function minutesFromNow(minutes: number): Date {
  return new Date(Math.floor(Date.now() / 1000 + minutes * 60) * 1000);
}
