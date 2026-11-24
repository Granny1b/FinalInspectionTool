import type * as AzureFunctions from '@azure/functions';
import {
  ApiErrorSchema,
  blobNames,
  CONTAINERS,
  ID_PATTERN,
  ImageReadUrlResponseSchema,
  ImageReadUrlsResponseSchema,
  ImageUploadUrlResponseSchema,
  newId,
} from '@modig/shared';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { context, principal, request } from '../../test/requests';
import { useTestStorage } from '../../test/storage';
import { readExpiry } from '../lib/images';
import { getImageUrl, getImageUrls, getUploadUrl } from './images';

// Record the registrations instead of letting the package (in "test mode") warn about them.
const registrations = vi.hoisted((): unknown[][] => []);
vi.mock('@azure/functions', async (importOriginal) => ({
  ...(await importOriginal<typeof AzureFunctions>()),
  app: { http: (...args: unknown[]) => registrations.push(args) },
}));

const inspector = principal('sam.andersson@modig.se', ['inspector']);
/** The smallest JPEG-ish payload: SOI + EOI markers. */
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

beforeAll(useTestStorage);

async function uploadUrl() {
  const response = await getUploadUrl(request({ principal: inspector, method: 'POST' }), context());
  expect(response.status).toBe(200);
  return ImageUploadUrlResponseSchema.parse(response.jsonBody);
}

function readUrl(id: string, who = inspector) {
  return getImageUrl(request({ principal: who, params: { id } }), context());
}

/** What the browser does with the upload URL. */
function putJpeg(url: string) {
  return fetch(url, {
    method: 'PUT',
    headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': 'image/jpeg' },
    body: JPEG,
  });
}

function minutesUntil(iso: string): number {
  return (Date.parse(iso) - Date.now()) / 60_000;
}

describe('registration', () => {
  it('registers the image routes, SWA doing authentication', () => {
    expect(registrations).toEqual([
      [
        'imageUploadUrl',
        {
          methods: ['POST'],
          authLevel: 'anonymous',
          route: 'images/upload-url',
          handler: getUploadUrl,
        },
      ],
      [
        'imageUrl',
        {
          methods: ['GET'],
          authLevel: 'anonymous',
          route: 'images/{id}/url',
          handler: getImageUrl,
        },
      ],
      [
        'imageUrls',
        {
          methods: ['POST'],
          authLevel: 'anonymous',
          route: 'images/urls',
          handler: getImageUrls,
        },
      ],
    ]);
  });
});

describe.each([
  ['POST /api/images/upload-url', getUploadUrl],
  ['GET /api/images/{id}/url', getImageUrl],
  ['POST /api/images/urls', getImageUrls],
])('%s access', (_name, handler) => {
  it('401 without a client principal, 403 without an app role', async () => {
    const params = { id: newId() };
    expect((await handler(request({ params }), context())).status).toBe(401);
    const guest = principal('guest@outlook.com', []);
    expect((await handler(request({ principal: guest, params }), context())).status).toBe(403);
  });
});

describe('POST /api/images/upload-url', () => {
  it('issues a new image id and a ~10 minute create/write URL for images/{id}.jpg', async () => {
    const { imageId, sasUrl, expiresAt } = await uploadUrl();
    expect(imageId).toMatch(ID_PATTERN);
    const url = new URL(sasUrl);
    expect(url.pathname).toMatch(
      new RegExp(`/${CONTAINERS.images}/${blobNames.image(imageId).replace('.', '\\.')}$`),
    );
    expect(url.searchParams.get('sp')).toBe('cw');
    expect(new Date(url.searchParams.get('se') ?? '').toISOString()).toBe(expiresAt);
    expect(minutesUntil(expiresAt)).toBeGreaterThan(9.9);
    expect(minutesUntil(expiresAt)).toBeLessThanOrEqual(10);
  });

  it('gives every call its own image id', async () => {
    const [a, b] = await Promise.all([uploadUrl(), uploadUrl()]);
    expect(a.imageId).not.toBe(b.imageId);
  });

  it('accepts the browser PUT of the JPEG but cannot read it back', async () => {
    const { sasUrl } = await uploadUrl();
    expect((await putJpeg(sasUrl)).status).toBe(201);
    expect((await fetch(sasUrl)).status).toBe(403);
  });
});

describe('GET /api/images/{id}/url', () => {
  it('returns a read-only URL, valid 1 to 13 hours, that serves the uploaded bytes', async () => {
    const { imageId, sasUrl } = await uploadUrl();
    await putJpeg(sasUrl);

    const response = await readUrl(imageId);
    expect(response.status).toBe(200);
    const { url, expiresAt } = ImageReadUrlResponseSchema.parse(response.jsonBody);
    expect(new URL(url).searchParams.get('sp')).toBe('r');
    expect(minutesUntil(expiresAt)).toBeGreaterThan(60);
    expect(minutesUntil(expiresAt)).toBeLessThanOrEqual(13 * 60);
    expect(new Date(new URL(url).searchParams.get('se') ?? '').toISOString()).toBe(expiresAt);

    const image = await fetch(url);
    expect(image.status).toBe(200);
    expect(image.headers.get('Content-Type')).toBe('image/jpeg');
    // The picture never changes, so the browser keeps it for as long as the URL can last.
    expect(image.headers.get('Cache-Control')).toBe('private, max-age=46800, immutable');
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(JPEG);
    expect((await putJpeg(url)).status).toBe(403);
  });

  it('serves an inline JPEG whatever type and disposition the uploader stored', async () => {
    // The upload URL can't restrict what is PUT: someone could store a web page or a download.
    const { imageId, sasUrl } = await uploadUrl();
    const page = await fetch(sasUrl, {
      method: 'PUT',
      headers: {
        'x-ms-blob-type': 'BlockBlob',
        'Content-Type': 'text/html',
        'x-ms-blob-content-disposition': 'attachment; filename="update.exe"',
      },
      body: '<h1>Not a photo</h1><script>alert(1)</script>',
    });
    expect(page.status).toBe(201);

    const { url } = ImageReadUrlResponseSchema.parse((await readUrl(imageId)).jsonBody);
    expect(new URL(url).searchParams.get('rsct')).toBe('image/jpeg');
    const served = await fetch(url);
    expect(served.status).toBe(200);
    expect(served.headers.get('Content-Type')).toBe('image/jpeg');
    expect(served.headers.get('Content-Disposition')).toBe('inline');
  });

  it('404 for an image that was never uploaded', async () => {
    const { imageId } = await uploadUrl(); // a URL was issued, but nothing was PUT
    const response = await readUrl(imageId);
    expect(response.status).toBe(404);
    expect(ApiErrorSchema.parse(response.jsonBody).error).toBe('not_found');
  });

  it('400 for a malformed id', async () => {
    expect((await readUrl('../templates/x')).status).toBe(400);
  });
});

describe('read URLs that the browser can keep the picture under', () => {
  it('gives the same URL for an image every time within a window', async () => {
    const { imageId, sasUrl } = await uploadUrl();
    await putJpeg(sasUrl);
    const first = ImageReadUrlResponseSchema.parse((await readUrl(imageId)).jsonBody);
    const second = ImageReadUrlResponseSchema.parse((await readUrl(imageId)).jsonBody);
    // Unless the two calls fell on either side of a window's end.
    if (first.expiresAt === second.expiresAt) expect(second.url).toBe(first.url);
  });

  it('expires every URL of a window together, an hour after the window ends', () => {
    const noon = Date.UTC(2026, 10, 24, 12);
    expect(readExpiry(noon).toISOString()).toBe('2026-11-25T01:00:00.000Z');
    expect(readExpiry(noon + 11 * 3_600_000).toISOString()).toBe('2026-11-25T01:00:00.000Z');
    expect(readExpiry(noon + 12 * 3_600_000).toISOString()).toBe('2026-11-25T13:00:00.000Z');
  });
});

describe('POST /api/images/urls', () => {
  function readUrls(body: unknown) {
    return getImageUrls(
      request({ principal: inspector, method: 'POST', body: JSON.stringify(body) }),
      context(),
    );
  }

  it('returns the read URLs of many images at once, leaving out one that does not exist', async () => {
    const [a, b, never] = await Promise.all([uploadUrl(), uploadUrl(), uploadUrl()]);
    await Promise.all([putJpeg(a.sasUrl), putJpeg(b.sasUrl)]);

    const response = await readUrls({ imageIds: [a.imageId, b.imageId, never.imageId, a.imageId] });
    expect(response.status).toBe(200);
    const { urls } = ImageReadUrlsResponseSchema.parse(response.jsonBody);
    expect(Object.keys(urls).sort()).toEqual([a.imageId, b.imageId].sort());
    const single = ImageReadUrlResponseSchema.parse((await readUrl(a.imageId)).jsonBody);
    if (single.expiresAt === urls[a.imageId]!.expiresAt) expect(urls[a.imageId]).toEqual(single);
    const served = await fetch(urls[b.imageId]!.url);
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(JPEG);
  });

  it('400 for no ids, a malformed id or too many', async () => {
    expect((await readUrls({ imageIds: [] })).status).toBe(400);
    expect((await readUrls({ imageIds: ['../templates/x'] })).status).toBe(400);
    expect((await readUrls({ imageIds: Array.from({ length: 501 }, () => newId()) })).status).toBe(
      400,
    );
    expect((await readUrls({})).status).toBe(400);
  });
});
