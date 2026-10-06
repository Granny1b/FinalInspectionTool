import { CONFLICT_MESSAGE } from '@modig/shared';
import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '../../lib/api';
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
