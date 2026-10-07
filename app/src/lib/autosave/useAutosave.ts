import { useEffect, useState, useSyncExternalStore } from 'react';
import { ApiRequestError, errorMessage } from '../api';
import {
  createAutosaver,
  type AutosaveOptions,
  type AutosaveState,
  type Autosaver,
  type SaveErrorKind,
} from './autosave';

/**
 * One autosaver for the lifetime of the component, and its state as React state. The options are
 * read once: `save` must not depend on props that change.
 */
export function useAutosave<T>(
  options: Omit<AutosaveOptions<T>, 'classifyError'>,
): [Autosaver<T>, AutosaveState] {
  const [saver] = useState(() => createAutosaver({ classifyError: classifySaveError, ...options }));
  const state = useSyncExternalStore(saver.subscribe, saver.getState);
  // Unmounting stops autosave for good, so a late change (a photo upload finishing after the editor
  // closed) is never saved with an outdated ETag. Leaving the page saves first (useLeaveGuard).
  useEffect(() => {
    saver.revive();
    return saver.dispose;
  }, [saver]);
  return [saver, state];
}

/** 412 stops autosaving; the network, 5xx, timeouts and rate limits are worth retrying. */
export function classifySaveError(error: unknown): { kind: SaveErrorKind; message: string } {
  const message = errorMessage(error);
  if (!(error instanceof ApiRequestError)) return { kind: 'transient', message };
  if (error.status === 412) return { kind: 'conflict', message };
  const transient = error.status >= 500 || error.status === 408 || error.status === 429;
  return { kind: transient ? 'transient' : 'rejected', message };
}
