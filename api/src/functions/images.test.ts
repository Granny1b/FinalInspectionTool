import type * as AzureFunctions from '@azure/functions';
import {
  ApiErrorSchema,
  blobNames,
  CONTAINERS,
  ID_PATTERN,
  ImageReadUrlResponseSchema,
  ImageUploadUrlResponseSchema,
  newId,
} from '@modig/shared';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { context, principal, request } from '../../test/requests';
import { useTestStorage } from '../../test/storage';
import { getImageUrl, getUploadUrl } from './images';

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
  it('registers both image routes, SWA doing authentication', () => {
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
    ]);
  });
});

describe.each([
  ['POST /api/images/upload-url', getUploadUrl],
  ['GET /api/images/{id}/url', getImageUrl],
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
  it('returns a ~15 minute read-only URL that serves the uploaded bytes', async () => {
    const { imageId, sasUrl } = await uploadUrl();
    await putJpeg(sasUrl);

    const response = await readUrl(imageId);
    expect(response.status).toBe(200);
    const { url, expiresAt } = ImageReadUrlResponseSchema.parse(response.jsonBody);
    expect(new URL(url).searchParams.get('sp')).toBe('r');
    expect(minutesUntil(expiresAt)).toBeGreaterThan(14.9);
    expect(minutesUntil(expiresAt)).toBeLessThanOrEqual(15);

    const image = await fetch(url);
    expect(image.status).toBe(200);
    expect(image.headers.get('Content-Type')).toBe('image/jpeg');
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(JPEG);
    expect((await putJpeg(url)).status).toBe(403);
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
