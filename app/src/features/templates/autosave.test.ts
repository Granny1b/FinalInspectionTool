import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAutosaver, type SaveErrorKind } from './autosave';

type Call = {
  value: string;
  etag: string;
  resolve: (etag: string) => void;
  reject: (error: unknown) => void;
};

class FakeError extends Error {
  constructor(readonly kind: SaveErrorKind) {
    super(`${kind} failure`);
  }
}

/** An autosaver whose saves stay pending until the test settles them. */
function setup() {
  const calls: Call[] = [];
  const save = vi.fn(
    (value: string, etag: string) =>
      new Promise<string>((resolve, reject) => calls.push({ value, etag, resolve, reject })),
  );
  const saver = createAutosaver<string>({
    etag: 'e0',
    save,
    classifyError: (error) => ({
      kind: error instanceof FakeError ? error.kind : 'transient',
      message: 'Could not save',
    }),
  });
  const statuses: string[] = [];
  saver.subscribe(() => statuses.push(saver.getState().status));
  return { saver, save, calls, statuses };
}

/** Lets promise callbacks run (fake timers don't advance microtasks by themselves). */
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('autosave', () => {
  it('saves once, 1 s after the last change', async () => {
    const { saver, save, calls } = setup();
    saver.change('a');
    await vi.advanceTimersByTimeAsync(600);
    saver.change('ab');
    await vi.advanceTimersByTimeAsync(600);
    saver.change('abc');
    await vi.advanceTimersByTimeAsync(999);
    expect(save).not.toHaveBeenCalled();
    expect(saver.getState().status).toBe('pending');

    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(calls[0]).toMatchObject({ value: 'abc', etag: 'e0' });
    expect(saver.getState().status).toBe('saving');

    calls[0]?.resolve('e1');
    await settle();
    expect(saver.getState().status).toBe('saved');
  });

  it('reports pending → saving → saved', async () => {
    const { saver, calls, statuses } = setup();
    saver.change('a');
    await vi.advanceTimersByTimeAsync(1000);
    calls[0]?.resolve('e1');
    await settle();
    expect(statuses).toEqual(['pending', 'saving', 'saved']);
  });

  it('keeps one request in flight and coalesces changes made meanwhile into one save', async () => {
    const { saver, save, calls } = setup();
    saver.change('v1');
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);

    // Typing on while the first save is slow: the debounce runs out, but nothing is sent.
    saver.change('v2');
    saver.change('v3');
    await vi.advanceTimersByTimeAsync(5000);
    saver.change('v4');
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(saver.getState().status).toBe('saving');

    // As soon as it returns, the latest value goes out with the ETag that save returned.
    calls[0]?.resolve('e1');
    await settle();
    expect(save).toHaveBeenCalledTimes(2);
    expect(calls[1]).toMatchObject({ value: 'v4', etag: 'e1' });

    calls[1]?.resolve('e2');
    await settle();
    expect(saver.getState().status).toBe('saved');
    expect(saver.etag()).toBe('e2');
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('waits for the debounce of a change made during a save', async () => {
    const { saver, save, calls } = setup();
    saver.change('v1');
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(300);
    saver.change('v2');
    calls[0]?.resolve('e1');
    await settle();
    expect(saver.getState().status).toBe('pending');
    expect(save).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(calls[1]).toMatchObject({ value: 'v2', etag: 'e1' });
  });

  it('chains If-Match from each response', async () => {
    const { saver, calls } = setup();
    for (const [index, value] of ['a', 'b', 'c'].entries()) {
      saver.change(value);
      await vi.advanceTimersByTimeAsync(1000);
      calls[index]?.resolve(`e${index + 1}`);
      await settle();
    }
    expect(calls.map((call) => call.etag)).toEqual(['e0', 'e1', 'e2']);
  });

  it('uses an ETag adopted from another request', async () => {
    const { saver, calls } = setup();
    saver.setEtag('published');
    saver.change('a');
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls[0]?.etag).toBe('published');
  });

  describe('on a conflict (412)', () => {
    it('stops saving for good and fails flushes', async () => {
      const { saver, save, calls } = setup();
      saver.change('mine');
      await vi.advanceTimersByTimeAsync(1000);
      calls[0]?.reject(new FakeError('conflict'));
      await settle();
      expect(saver.getState()).toEqual({ status: 'conflict' });

      saver.change('more');
      await vi.advanceTimersByTimeAsync(60_000);
      expect(save).toHaveBeenCalledTimes(1);
      await expect(saver.flush()).resolves.toBe(false);
      expect(save).toHaveBeenCalledTimes(1);
    });

    it('drops a save that was queued behind the conflicting one', async () => {
      const { saver, save, calls } = setup();
      saver.change('a');
      await vi.advanceTimersByTimeAsync(1000);
      saver.change('b');
      await vi.advanceTimersByTimeAsync(1000);
      calls[0]?.reject(new FakeError('conflict'));
      await vi.advanceTimersByTimeAsync(10_000);
      expect(save).toHaveBeenCalledTimes(1);
      expect(saver.getState().status).toBe('conflict');
    });
  });

  describe('on a transient failure (network, 5xx)', () => {
    it('retries with backoff, sending the latest value', async () => {
      const { saver, save, calls } = setup();
      saver.change('a');
      await vi.advanceTimersByTimeAsync(1000);
      calls[0]?.reject(new FakeError('transient'));
      await settle();
      expect(saver.getState()).toEqual({
        status: 'error',
        message: 'Could not save',
        willRetry: true,
      });

      // Typing meanwhile doesn't trigger extra requests; the retry picks the change up.
      saver.change('ab');
      await vi.advanceTimersByTimeAsync(999);
      expect(save).toHaveBeenCalledTimes(1);
      expect(saver.getState().status).toBe('error');
      await vi.advanceTimersByTimeAsync(1);
      expect(calls[1]).toMatchObject({ value: 'ab', etag: 'e0' });

      // Second failure: the next try waits longer.
      calls[1]?.reject(new FakeError('transient'));
      await settle();
      await vi.advanceTimersByTimeAsync(1999);
      expect(save).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(save).toHaveBeenCalledTimes(3);

      calls[2]?.resolve('e1');
      await settle();
      expect(saver.getState().status).toBe('saved');
    });

    it('backs off 1, 2, 5, 10 and then every 30 s', async () => {
      const { saver, save, calls } = setup();
      saver.change('a');
      await vi.advanceTimersByTimeAsync(1000);
      for (const [attempt, wait] of [1000, 2000, 5000, 10_000, 30_000, 30_000, 30_000].entries()) {
        calls[attempt]?.reject(new FakeError('transient'));
        await settle();
        await vi.advanceTimersByTimeAsync(wait - 1);
        expect(save).toHaveBeenCalledTimes(attempt + 1);
        await vi.advanceTimersByTimeAsync(1);
        expect(save).toHaveBeenCalledTimes(attempt + 2);
      }
    });

    it('retries at once when the user asks', async () => {
      const { saver, save, calls } = setup();
      saver.change('a');
      await vi.advanceTimersByTimeAsync(1000);
      calls[0]?.reject(new FakeError('transient'));
      await settle();

      const flushed = saver.flush();
      expect(save).toHaveBeenCalledTimes(2);
      calls[1]?.resolve('e1');
      await expect(flushed).resolves.toBe(true);
      // The scheduled automatic retry was cancelled.
      await vi.advanceTimersByTimeAsync(60_000);
      expect(save).toHaveBeenCalledTimes(2);
    });
  });

  describe('on a rejected save (other 4xx)', () => {
    it('does not retry the same value, but saves the next change', async () => {
      const { saver, save, calls } = setup();
      saver.change('bad');
      await vi.advanceTimersByTimeAsync(1000);
      calls[0]?.reject(new FakeError('rejected'));
      await settle();
      expect(saver.getState()).toMatchObject({ status: 'error', willRetry: false });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(save).toHaveBeenCalledTimes(1);

      saver.change('fixed');
      expect(saver.getState().status).toBe('pending');
      await vi.advanceTimersByTimeAsync(1000);
      expect(calls[1]).toMatchObject({ value: 'fixed', etag: 'e0' });
    });

    it('goes straight on to a newer change made during the failed save', async () => {
      const { saver, calls } = setup();
      saver.change('bad');
      await vi.advanceTimersByTimeAsync(1000);
      saver.change('fixed');
      await vi.advanceTimersByTimeAsync(1000);
      calls[0]?.reject(new FakeError('rejected'));
      await settle();
      expect(calls[1]?.value).toBe('fixed');
      expect(saver.getState().status).toBe('saving');
    });
  });

  describe('flush', () => {
    it('resolves at once when nothing changed', async () => {
      const { saver, save } = setup();
      await expect(saver.flush()).resolves.toBe(true);
      expect(save).not.toHaveBeenCalled();
    });

    it('skips the debounce', async () => {
      const { saver, save, calls } = setup();
      saver.change('a');
      const flushed = saver.flush();
      expect(save).toHaveBeenCalledTimes(1);
      calls[0]?.resolve('e1');
      await expect(flushed).resolves.toBe(true);
      await vi.advanceTimersByTimeAsync(5000);
      expect(save).toHaveBeenCalledTimes(1);
    });

    it('waits for the save in flight and the one after it', async () => {
      const { saver, calls } = setup();
      saver.change('a');
      await vi.advanceTimersByTimeAsync(1000);
      saver.change('ab');
      let result: boolean | undefined;
      void saver.flush().then((saved) => (result = saved));

      calls[0]?.resolve('e1');
      await settle();
      expect(result).toBeUndefined();
      expect(calls[1]).toMatchObject({ value: 'ab', etag: 'e1' });
      calls[1]?.resolve('e2');
      await settle();
      expect(result).toBe(true);
    });

    it('resolves false when the save fails', async () => {
      const { saver, calls } = setup();
      saver.change('a');
      const flushed = saver.flush();
      calls[0]?.reject(new FakeError('transient'));
      await expect(flushed).resolves.toBe(false);
    });
  });

  it('cancel() drops the pending debounce', async () => {
    const { saver, save } = setup();
    saver.change('a');
    saver.cancel();
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).not.toHaveBeenCalled();
  });
});
