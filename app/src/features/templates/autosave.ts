/**
 * Autosave for a document saved with ETags (brief §5.2):
 * - saves `delayMs` after the last change (debounce);
 * - one request in flight at a time; changes made meanwhile become one follow-up save;
 * - the latest value always ends up saved, or the failure stays visible;
 * - every save sends the ETag the previous one returned (If-Match);
 * - a conflict (412) stops autosaving until the document is reloaded, so nobody's work is
 *   overwritten;
 * - transient failures (network, 5xx) are retried with backoff; a rejected save (other 4xx) waits
 *   for the next change or a manual retry, because sending the same body again can't help;
 * - a failure on the way may hide a save the server did store (only the answer was lost), so a 412
 *   after one is checked against the stored document before it counts as a conflict;
 * - once disposed (unmounted) it saves nothing more, not even a change that comes in late.
 *
 * Framework-free so it can be tested with fake timers; useAutosave binds it to React.
 */

export type AutosaveState =
  | { status: 'saved' }
  /** Changed, waiting for the debounce. */
  | { status: 'pending' }
  | { status: 'saving' }
  | { status: 'error'; message: string; willRetry: boolean }
  /** Someone else saved first. Nothing is saved any more until a reload. */
  | { status: 'conflict' };

export type SaveErrorKind = 'conflict' | 'transient' | 'rejected';

export type AutosaveOptions<T> = {
  /** ETag of the document as loaded. */
  etag: string;
  /** Saves `value` with If-Match `etag`; resolves to the new ETag. */
  save: (value: T, etag: string) => Promise<string>;
  classifyError: (error: unknown) => { kind: SaveErrorKind; message: string };
  delayMs?: number;
  /** Waits before automatic retries of transient failures; the last one repeats. */
  retryDelaysMs?: readonly number[];
  /**
   * Reads the stored document and its ETag. Asked after a 412 that follows saves which failed on
   * the way: if one of them was stored after all, the 412 is our own doing, not a conflict.
   */
  reconcile?: () => Promise<{ etag: string; value: T }>;
  /** Whether two values are the same document (for `reconcile`); default `Object.is`. */
  equals?: (a: T, b: T) => boolean;
};

export type Autosaver<T> = {
  /** Records the latest value and (re)starts the debounce. */
  change: (value: T) => void;
  /** Saves right away; resolves true once everything changed so far is saved, false on failure. */
  flush: () => Promise<boolean>;
  /** The ETag the next save sends. */
  etag: () => string;
  /** Adopts an ETag from another request on the same document (e.g. publish). */
  setEtag: (etag: string) => void;
  getState: () => AutosaveState;
  subscribe: (listener: () => void) => () => void;
  /** Stops for good (unmount): clears timers and ignores later changes and answers. */
  dispose: () => void;
  /** Undoes `dispose` (React's StrictMode unmounts and mounts again). */
  revive: () => void;
};

export const AUTOSAVE_DELAY_MS = 1000;
export const RETRY_DELAYS_MS = [1000, 2000, 5000, 10_000, 30_000] as const;

const SAVED: AutosaveState = { status: 'saved' };
const PENDING: AutosaveState = { status: 'pending' };
const SAVING: AutosaveState = { status: 'saving' };
const CONFLICT: AutosaveState = { status: 'conflict' };

export function createAutosaver<T>({
  etag: initialEtag,
  save,
  classifyError,
  delayMs = AUTOSAVE_DELAY_MS,
  retryDelaysMs = RETRY_DELAYS_MS,
  reconcile,
  equals = Object.is,
}: AutosaveOptions<T>): Autosaver<T> {
  let etag = initialEtag;
  let latest: { value: T } | null = null;
  /** Bumped by every change; `savedVersion` is the one the server has. */
  let version = 0;
  let savedVersion = 0;
  let inFlight = false;
  /** A save was due while another was in flight: run it as soon as that one finishes. */
  let queued = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let failures = 0;
  /** Values sent since the last confirmed save whose requests failed on the way. */
  let unconfirmed: Array<{ version: number; value: T }> = [];
  let disposed = false;
  let state: AutosaveState = SAVED;
  const listeners = new Set<() => void>();
  let waiters: Array<(saved: boolean) => void> = [];

  const dirty = () => version !== savedVersion;

  function setState(next: AutosaveState) {
    if (next !== state) {
      state = next;
      for (const listener of listeners) listener();
    }
    if (next.status === 'saved' || next.status === 'error' || next.status === 'conflict') {
      const settled = waiters;
      waiters = [];
      for (const resolve of settled) resolve(next.status === 'saved');
    }
  }

  function clearTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function schedule(ms: number) {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      run();
    }, ms);
  }

  function run() {
    if (disposed || state.status === 'conflict') return;
    if (inFlight) {
      queued = true;
      return;
    }
    queued = false;
    if (!dirty() || !latest) return setState(SAVED);

    const attempt = version;
    const { value } = latest;
    inFlight = true;
    setState(SAVING);
    save(value, etag).then(
      (nextEtag) => {
        inFlight = false;
        etag = nextEtag;
        savedVersion = attempt;
        failures = 0;
        unconfirmed = [];
        continueAfterSave();
      },
      (error: unknown) => {
        const { kind, message } = classifyError(error);
        if (kind === 'conflict') {
          // Still "in flight" while checking: nothing else may be sent meanwhile.
          if (reconcile && unconfirmed.length > 0) return void recover(reconcile);
          inFlight = false;
          return stop();
        }
        inFlight = false;
        if (kind === 'transient') {
          // It may have been stored and only the answer lost; a 412 later will tell (recover).
          unconfirmed.push({ version: attempt, value });
          // The retry saves whatever is latest by then, so it replaces any pending debounce.
          failures += 1;
          queued = false;
          schedule(retryDelaysMs[Math.min(failures, retryDelaysMs.length) - 1] ?? delayMs);
          return setState({ status: 'error', message, willRetry: true });
        }
        // Rejected: a newer change may fix it, otherwise wait for one (or a manual retry).
        if (version !== attempt) return continueAfterSave();
        setState({ status: 'error', message, willRetry: false });
      },
    );
  }

  /**
   * A 412 after saves that failed on the way: if the stored document is one of them, the server
   * did store it and only the answer was lost, so the ETag moved on without us. Take that ETag
   * over and carry on (newer changes are saved with it); anything else is a real conflict.
   */
  async function recover(read: NonNullable<AutosaveOptions<T>['reconcile']>) {
    const stored = await read().catch(() => null);
    inFlight = false;
    const match = stored && unconfirmed.findLast((sent) => equals(sent.value, stored.value));
    if (!stored || !match) return stop();
    etag = stored.etag;
    savedVersion = match.version;
    unconfirmed = [];
    failures = 0;
    continueAfterSave();
  }

  /** Someone else saved first: nothing is saved any more until a reload. */
  function stop() {
    clearTimer();
    queued = false;
    setState(CONFLICT);
  }

  /** After a request: save newer changes now if their debounce has run out, else wait for it. */
  function continueAfterSave() {
    if (!dirty()) return setState(SAVED);
    if (queued || timer === null) return run();
    setState(PENDING);
  }

  return {
    change(value) {
      if (disposed) return;
      latest = { value };
      version += 1;
      if (state.status === 'conflict') return;
      // A scheduled retry already saves the latest value; typing must not hammer a failing server.
      if (state.status === 'error' && state.willRetry) return;
      schedule(delayMs);
      if (!inFlight) setState(PENDING);
    },

    flush() {
      if (disposed || state.status === 'conflict') return Promise.resolve(false);
      const done = new Promise<boolean>((resolve) => waiters.push(resolve));
      clearTimer();
      if (inFlight) queued = true;
      else run();
      return done;
    },

    etag: () => etag,
    setEtag(next) {
      etag = next;
    },
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      disposed = true;
      clearTimer();
    },
    revive() {
      disposed = false;
    },
  };
}
