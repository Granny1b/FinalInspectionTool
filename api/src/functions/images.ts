/**
 * Image URLs (brief §3, §8). The browser resizes a photo, asks for an upload URL and PUTs the
 * JPEG straight to blob storage (header `x-ms-blob-type: BlockBlob`); to show an image, it asks
 * for a read URL.
 *
 *   POST /api/images/upload-url   inspector   ImageUploadUrlResponse (create/write SAS, ~10 min)
 *   GET  /api/images/{id}/url     inspector   ImageReadUrlResponse (read-only SAS, 1 to 13 hours)
 *   POST /api/images/urls         inspector   ImageReadUrlsResponse (the same for many images)
 */
import { app } from '@azure/functions';
import { ImageReadUrlsRequestSchema } from '@modig/shared';
import { endpoint, idParam, json, NotFoundError, readJsonBody } from '../lib/http';
import { createReadUrl, createReadUrls, createUploadUrl } from '../lib/images';

export const getUploadUrl = endpoint({ role: 'inspector' }, async () =>
  json(200, await createUploadUrl()),
);

export const getImageUrl = endpoint({ role: 'inspector' }, async (req) => {
  const readUrl = await createReadUrl(idParam(req));
  if (!readUrl) throw new NotFoundError('This image does not exist.');
  return json(200, readUrl);
});

/** A page full of pictures asks once for all of them instead of once per picture. */
export const getImageUrls = endpoint({ role: 'inspector' }, async (req) => {
  const { imageIds } = await readJsonBody(req, ImageReadUrlsRequestSchema);
  return json(200, await createReadUrls(imageIds));
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

app.http('imageUrls', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'images/urls',
  handler: getImageUrls,
});
