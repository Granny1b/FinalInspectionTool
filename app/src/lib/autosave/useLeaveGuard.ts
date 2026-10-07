import { useEffect, useState } from 'react';
import { useBlocker } from 'react-router';

/**
 * Keeps unsaved work from being lost when leaving the page. Closing or reloading the tab gets the
 * browser's own warning. A link inside the app first tries to save (usually it is only the
 * debounce that hasn't run yet) and goes on; only if saving fails does it ask.
 */
export function useLeaveGuard(dirty: boolean, flush: () => Promise<boolean>) {
  const blocker = useBlocker(dirty);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    let current = true;
    void flush().then((saved) => {
      if (!current) return;
      if (saved) blocker.proceed();
      else setAsking(true);
    });
    return () => {
      current = false;
    };
  }, [blocker, flush]);

  return {
    /** True while the "leave without saving?" question should be shown. */
    asking,
    leave: () => {
      setAsking(false);
      blocker.proceed?.();
    },
    stay: () => {
      setAsking(false);
      blocker.reset?.();
    },
  };
}
