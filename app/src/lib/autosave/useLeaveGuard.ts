import { useEffect, useState } from 'react';
import { useBlocker } from 'react-router';

/** Why leaving asks first: an open editor's changes, or a save that failed. */
export type LeaveQuestion = 'editor' | 'unsaved';

/**
 * Keeps unsaved work from being lost when leaving the page. Closing or reloading the tab gets the
 * browser's own warning. A link inside the app (or the browser's Back) first tries to save
 * (usually it is only the debounce that hasn't run yet) and goes on; only if saving fails does it
 * ask. Changes in an open editor dialog (a photo being marked up, a guide) are not in the document
 * yet, so nothing can save them: with `editorDirty` it asks first, and saves the rest on leaving.
 */
export function useLeaveGuard(dirty: boolean, flush: () => Promise<boolean>, editorDirty = false) {
  const blocker = useBlocker(dirty || editorDirty);
  /** Saving before leaving failed. */
  const [failed, setFailed] = useState(false);
  /** The user chose to leave the open editor's changes behind. */
  const [discarding, setDiscarding] = useState(false);
  const blocked = blocker.state === 'blocked';
  const keepsEditor = editorDirty && !discarding;

  useEffect(() => {
    if (!dirty && !editorDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, editorDirty]);

  useEffect(() => {
    if (blocker.state !== 'blocked' || keepsEditor) return;
    let current = true;
    void flush().then((saved) => {
      if (!current) return;
      if (saved) blocker.proceed();
      else setFailed(true);
    });
    return () => {
      current = false;
    };
  }, [blocker, flush, keepsEditor]);

  const question: LeaveQuestion | null = !blocked
    ? null
    : keepsEditor
      ? 'editor'
      : failed
        ? 'unsaved'
        : null;

  return {
    /** The "leave without saving?" question to show, if any. */
    question,
    leave: () => {
      // Past the editor, leaving saves the document as any link does (and asks if that fails).
      if (question === 'editor') return setDiscarding(true);
      setFailed(false);
      blocker.proceed?.();
    },
    stay: () => {
      setFailed(false);
      setDiscarding(false);
      blocker.reset?.();
    },
  };
}
