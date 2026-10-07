import { CONFLICT_MESSAGE } from '@modig/shared';
import { describe, expect, it } from 'vitest';
import { ApiRequestError, SIGNED_OUT_MESSAGE } from '../api';
import { createAutosaver } from './autosave';
import { classifySaveError } from './useAutosave';

const apiError = (status: number, message = 'Nope.') =>
  new ApiRequestError(status, { error: 'bad_request', message });

describe('classifySaveError', () => {
  it('treats 412 as a conflict that stops autosave', () => {
    expect(
      classifySaveError(
        new ApiRequestError(412, { error: 'precondition_failed', message: CONFLICT_MESSAGE }),
      ),
    ).toEqual({ kind: 'conflict', message: CONFLICT_MESSAGE });
  });

  it('retries server errors, timeouts and rate limits', () => {
    for (const status of [500, 502, 503, 408, 429]) {
      expect(classifySaveError(apiError(status)).kind).toBe('transient');
    }
  });

  it('retries a failed fetch (offline), with a message about the connection', () => {
    expect(classifySaveError(new TypeError('Failed to fetch'))).toEqual({
      kind: 'transient',
      message: "Couldn't reach the server. Check your connection and try again.",
    });
  });

  it('does not retry other client errors, and passes their message on', () => {
    expect(classifySaveError(apiError(409, 'Model taken.'))).toEqual({
      kind: 'rejected',
      message: 'Model taken.',
    });
    for (const status of [400, 404]) {
      expect(classifySaveError(apiError(status)).kind).toBe('rejected');
    }
  });
});

describe('a save refused because the session ended', () => {
  it('shows the failure (no retry, no hanging "Saving…") and fails the flush', async () => {
    // What apiFetch throws for a write that SWA answered with a redirect to the sign-in page.
    const signedOut = new ApiRequestError(401, {
      error: 'unauthorized',
      message: SIGNED_OUT_MESSAGE,
    });
    const saver = createAutosaver<string>({
      etag: 'e0',
      save: () => Promise.reject(signedOut),
      classifyError: classifySaveError,
    });
    saver.change('typed after the session ended');
    await expect(saver.flush()).resolves.toBe(false);
    expect(saver.getState()).toEqual({
      status: 'error',
      message: SIGNED_OUT_MESSAGE,
      willRetry: false,
    });
  });
});
