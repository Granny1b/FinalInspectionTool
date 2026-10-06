/**
 * Autosave for a document saved with ETags (brief §5.2):
 * - saves `delayMs` after the last change (debounce);
 * - one request in flight at a time; changes made meanwhile become one follow-up save;
 * - the latest value always ends up saved, or the failure stays visible;
 * - every save sends the ETag the previous one returned (If-Match);
 * - a conflict (412) stops autosaving until the document is reloaded, so nobody's work is
 *   overwritten;
 * - transient failures (network, 5xx) are retried with backoff; a rejected save (other 4xx) waits
 *   for the next change or a manual retry, because sending the same body again can't help.
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
  /** Clears timers (on unmount). */
  cancel: () => void;
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
    if (state.status === 'conflict') return;
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
        continueAfterSave();
      },
      (error: unknown) => {
        inFlight = false;
        const { kind, message } = classifyError(error);
        if (kind === 'conflict') {
          clearTimer();
          queued = false;
          return setState(CONFLICT);
        }
        if (kind === 'transient') {
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

  /** After a request: save newer changes now if their debounce has run out, else wait for it. */
  function continueAfterSave() {
    if (!dirty()) return setState(SAVED);
    if (queued || timer === null) return run();
    setState(PENDING);
  }

  return {
    change(value) {
      latest = { value };
      version += 1;
      if (state.status === 'conflict') return;
      // A scheduled retry already saves the latest value; typing must not hammer a failing server.
      if (state.status === 'error' && state.willRetry) return;
      schedule(delayMs);
      if (!inFlight) setState(PENDING);
    },

    flush() {
      if (state.status === 'conflict') return Promise.resolve(false);
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
    cancel: clearTimer,
  };
}
