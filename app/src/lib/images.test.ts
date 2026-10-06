import { IMAGE_MAX_EDGE_PX } from '@modig/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fitWithin, ImageError, putToStorage } from './images';

describe('fitWithin', () => {
  it('scales a landscape photo to the maximum long edge', () => {
    expect(fitWithin({ width: 4032, height: 3024 })).toEqual({ width: 1600, height: 1200 });
  });

  it('scales a portrait photo by its height', () => {
    expect(fitWithin({ width: 3024, height: 4032 })).toEqual({ width: 1200, height: 1600 });
  });

  it('never enlarges a small image', () => {
    expect(fitWithin({ width: 640, height: 480 })).toEqual({ width: 640, height: 480 });
    expect(fitWithin({ width: 1600, height: 900 })).toEqual({ width: 1600, height: 900 });
  });

  it('rounds to whole pixels and keeps at least one', () => {
    expect(fitWithin({ width: 5000, height: 3 })).toEqual({ width: 1600, height: 1 });
    expect(fitWithin({ width: 3001, height: 2001 })).toEqual({ width: 1600, height: 1067 });
  });

  it('uses the shared limit by default', () => {
    const { width, height } = fitWithin({ width: 10_000, height: 10_000 });
    expect(Math.max(width, height)).toBe(IMAGE_MAX_EDGE_PX);
  });

  it('takes another limit', () => {
    expect(fitWithin({ width: 800, height: 400 }, 200)).toEqual({ width: 200, height: 100 });
  });
});

describe('putToStorage', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' });
  const sasUrl = 'https://account.blob.core.windows.net/images/abc.jpg?sig=x';

  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it('PUTs the JPEG as a block blob, without cookies', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 201 }));
    await putToStorage(sasUrl, jpeg);
    expect(fetchMock).toHaveBeenCalledWith(sasUrl, {
      method: 'PUT',
      headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': 'image/jpeg' },
      body: jpeg,
      credentials: 'omit',
    });
  });

  it('turns a refused upload into a user-facing error', async () => {
    fetchMock.mockResolvedValue(new Response('AuthenticationFailed', { status: 403 }));
    await expect(putToStorage(sasUrl, jpeg)).rejects.toThrow(
      new ImageError("Couldn't upload the image (HTTP 403). Try again."),
    );
  });

  it('turns a network failure into a user-facing error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(putToStorage(sasUrl, jpeg)).rejects.toBeInstanceOf(ImageError);
  });
});
