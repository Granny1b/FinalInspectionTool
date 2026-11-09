/**
 * Undo/redo as a list of snapshots: states are small (a photo's annotations, a checklist
 * template's draft) and share what didn't change, so no diffs.
 */
export type History<T> = {
  past: readonly T[];
  present: T;
  future: readonly T[];
};

/** Enough for any annotation session; older steps are dropped. */
export const HISTORY_LIMIT = 100;

export function startHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

/** A new step; redo is no longer possible. The same value again records nothing. */
export function record<T>(history: History<T>, next: T): History<T> {
  if (Object.is(next, history.present)) return history;
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
  };
}

/**
 * The present replaced without a new step: more of the same edit (typing on in the same field)
 * is taken back by one undo. Redo is no longer possible.
 */
export function amend<T>(history: History<T>, next: T): History<T> {
  if (Object.is(next, history.present)) return history;
  return { past: history.past, present: next, future: [] };
}

export function undo<T>(history: History<T>): History<T> {
  if (!canUndo(history)) return history;
  return {
    past: history.past.slice(0, -1),
    present: history.past[history.past.length - 1] as T,
    future: [history.present, ...history.future],
  };
}

export function redo<T>(history: History<T>): History<T> {
  if (!canRedo(history)) return history;
  return {
    past: [...history.past, history.present],
    present: history.future[0] as T,
    future: history.future.slice(1),
  };
}

export function canUndo(history: History<unknown>): boolean {
  return history.past.length > 0;
}

export function canRedo(history: History<unknown>): boolean {
  return history.future.length > 0;
}

type KeyLike = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>;

/**
 * Ctrl+Z undo, Ctrl+Shift+Z or Ctrl+Y redo (⌘ on a Mac). With Alt held nothing matches: Ctrl+Alt
 * is AltGr on Swedish keyboards (@, {, [ …).
 */
export function historyKey(event: KeyLike): 'undo' | 'redo' | null {
  if (event.altKey || !(event.ctrlKey || event.metaKey)) return null;
  const key = event.key.toLowerCase();
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && !event.shiftKey) return 'redo';
  return null;
}
