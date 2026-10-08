/**
 * Image URLs (brief §3, §8). The browser resizes a photo, asks for an upload URL and PUTs the
 * JPEG straight to blob storage (header `x-ms-blob-type: BlockBlob`); to show an image, it asks
 * for a read URL.
 *
 *   POST /api/images/upload-url   inspector   ImageUploadUrlResponse (create/write SAS, ~10 min)
 *   GET  /api/images/{id}/url     inspector   ImageReadUrlResponse (read-only SAS, ~15 min)
 */
import { app } from '@azure/functions';
import { endpoint, idParam, json, NotFoundError } from '../lib/http';
import { createReadUrl, createUploadUrl } from '../lib/images';

export const getUploadUrl = endpoint({ role: 'inspector' }, async () =>
  json(200, await createUploadUrl()),
);

export const getImageUrl = endpoint({ role: 'inspector' }, async (req) => {
  const readUrl = await createReadUrl(idParam(req));
  if (!readUrl) throw new NotFoundError('This image does not exist.');
  return json(200, readUrl);
});

app.http('imageUploadUrl', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'images/upload-url',
  handler: getUploadUrl,
});

app.http('imageUrl', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'images/{id}/url',
  handler: getImageUrl,
});
