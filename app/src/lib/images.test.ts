import { IMAGE_MAX_EDGE_PX } from '@modig/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { fitWithin, ImageError, imageUrlQuery, putToStorage, uploadJpeg } from './images';

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
    vi.restoreAllMocks();
  });

  it('PUTs the JPEG as a block blob, without cookies', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 201 }));
    await putToStorage(sasUrl, jpeg);
    expect(fetchMock).toHaveBeenCalledWith(sasUrl, {
      method: 'PUT',
      headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': 'image/jpeg' },
      body: jpeg,
      credentials: 'omit',
      signal: expect.any(AbortSignal) as AbortSignal,
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

  it('gives up on an upload that hangs, so it can be tried again', async () => {
    hang();
    // The timeout, already expired.
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() =>
      AbortSignal.abort(new DOMException('Timed out', 'TimeoutError')),
    );
    await expect(putToStorage(sasUrl, jpeg)).rejects.toThrow(
      new ImageError('The upload took too long. Check your connection and try again.'),
    );
  });

  it('stops when the caller stops it (Cancel while saving)', async () => {
    const urlResponse = {
      imageId: 'img0000000000001',
      sasUrl,
      expiresAt: '2026-10-08T12:00:00.000Z',
    };
    hang((url) => (url.startsWith('/api/') ? Response.json(urlResponse) : null));
    const stop = new AbortController();
    const upload = uploadJpeg(jpeg, stop.signal);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    stop.abort();
    await expect(upload).rejects.toMatchObject({ name: 'AbortError' });
  });

  /** A fetch that never answers (or answers `answer`'s response), until its signal aborts. */
  function hang(answer: (url: string) => Response | null = () => null) {
    fetchMock.mockImplementation((input, init) => {
      const response = answer(String(input));
      if (response) return Promise.resolve(response);
      return new Promise((_, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) reject(signal.reason as Error);
        signal?.addEventListener('abort', () => reject(signal.reason as Error));
      });
    });
  }
});

describe('imageUrlQuery', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
  const urlOf = (id: string) => `https://account.blob.core.windows.net/images/${id}.jpg?sig=x`;

  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  /** Answers like the API: a URL for every id asked for, except the ones in `missing`. */
  function answer(missing: string[] = []) {
    fetchMock.mockImplementation((_path, init) => {
      const { imageIds } = JSON.parse(String(init?.body)) as { imageIds: string[] };
      const urls = Object.fromEntries(
        imageIds
          .filter((id) => !missing.includes(id))
          .map((id) => [id, { url: urlOf(id), expiresAt }]),
      );
      return Promise.resolve(Response.json({ urls }));
    });
  }

  it('asks for the pictures of a page in one request', async () => {
    answer();
    const client = new QueryClient();
    const urls = await Promise.all(
      ['a1', 'b2', 'c3', 'a1'].map((id) => client.fetchQuery(imageUrlQuery(id))),
    );
    expect(urls).toEqual([urlOf('a1'), urlOf('b2'), urlOf('c3'), urlOf('a1')]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/images/urls');
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toEqual({
      imageIds: ['a1', 'b2', 'c3'],
    });
  });

  it('keeps a URL until shortly before it expires, without asking again', async () => {
    answer();
    const client = new QueryClient();
    await client.fetchQuery(imageUrlQuery('d4'));
    await client.fetchQuery(imageUrlQuery('d4'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails only the picture that does not exist', async () => {
    answer(['gone']);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const [found, missing] = await Promise.allSettled([
      client.fetchQuery(imageUrlQuery('e5')),
      client.fetchQuery(imageUrlQuery('gone')),
    ]);
    expect(found).toMatchObject({ status: 'fulfilled', value: urlOf('e5') });
    expect(missing).toMatchObject({ status: 'rejected', reason: { status: 404 } });
  });
});
