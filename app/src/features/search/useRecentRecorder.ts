import { APP_NAME } from '@modig/shared';
import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { recentKindOf, recordRecent } from './recent';

const SUFFIX = ` · ${APP_NAME}`;
/** Looked at four times a second, for six seconds. */
const INTERVAL_MS = 250;
const TRIES = 24;
/** A title unchanged since the page before is taken for this page's after a second and a half. */
const SAME_TITLE_TRIES = 6;

/** The title last seen on the page before this one: until it changes, this page is loading. */
let titleBefore = '';

/**
 * Remembers the pages worth coming back to as they are opened (a machine, an instruction, a
 * check), by the title the page gives itself once it has loaded. For "Continue where you left
 * off" in the search.
 */
export function useRecentRecorder(): void {
  const { pathname } = useLocation();
  useEffect(() => {
    const kind = recentKindOf(pathname);
    // The title comes with the page's data: at once when the data was at hand, else a moment
    // later, and sometimes in two goes (an instruction, then the machine it is on). So it is
    // looked at for a few seconds and remembered each time it has changed. While it is still the
    // title of the page one came from, it is not taken for this page's, unless it stays (two
    // pages may share a title).
    const before = titleBefore;
    let tries = 0;
    let recorded = '';
    const look = () => {
      const settled = document.title !== before || tries >= SAME_TITLE_TRIES;
      const title = document.title.endsWith(SUFFIX)
        ? document.title.slice(0, -SUFFIX.length).trim()
        : '';
      if (settled) titleBefore = document.title;
      if (!kind || !settled || title === '' || title === recorded) return;
      if (/^(loading|no such)/i.test(title)) return;
      recorded = title;
      recordRecent({ path: pathname, kind, title });
    };
    look();
    const timer = setInterval(() => {
      tries += 1;
      look();
      if (tries >= TRIES) clearInterval(timer);
    }, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [pathname]);
}
