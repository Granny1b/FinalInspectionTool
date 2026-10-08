import {
  rowRef,
  sectionNumber,
  STATUS_LABELS,
  type Section,
  type Severity,
  type Status,
} from '@modig/shared';
import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import type { Move, RowCommand } from './keys';
import { advancesAfter, rowOrder, targetRow } from './navigation';
import { withRemainingOk, withSeverity, withStatus, withText, type Results } from './results';

/** Everything rows and section headers can ask the sheet to do. The object is stable. */
export type ChecklistActions = {
  /** A key pressed on a focused row (the guide and Space are the row's own business). */
  run: (itemId: string, command: Exclude<RowCommand, { kind: 'guide' | 'none' }>) => void;
  /** A click on a status segment: sets it, or clears it when it was already selected. */
  pick: (itemId: string, status: Status) => void;
  setText: (itemId: string, field: 'comment' | 'resp', value: string) => void;
  setSeverity: (itemId: string, severity: Severity) => void;
  setRemainingOk: (sectionId: string) => void;
  /** Escape in a field. */
  focusRow: (itemId: string) => void;
  /** Enter in a field: on to the next row, or back to this one at the end of the checklist. */
  finishRow: (itemId: string) => void;
  /** Read out by the sheet's live region. */
  announce: (message: string) => void;
  /** A NOK row's photo count: shows its deviation's photos (the page's Deviations tab). */
  showPhotos: (itemId: string) => void;
  /** The row's guide icon or `G`: opens its guide in the viewer. */
  showGuide: (itemId: string) => void;
};

type Options = {
  sections: Section[];
  results: Results;
  onChange: (results: Results) => void;
  rootRef: RefObject<HTMLElement | null>;
  announce: (message: string) => void;
  onShowPhotos: (itemId: string) => void;
  onShowGuide: (itemId: string) => void;
};

/**
 * Stable callbacks over the latest results, so memoised rows never re-render because a callback
 * changed. Edits made in one event build on each other even before the page re-renders.
 */
export function useChecklistActions(options: Options): ChecklistActions {
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });
  const { rootRef } = options;

  return useMemo<ChecklistActions>(() => {
    const commit = (next: Results) => {
      if (next === latest.current.results) return;
      latest.current = { ...latest.current, results: next };
      latest.current.onChange(next);
    };
    const refOf = (itemId: string) => {
      const { sections } = latest.current;
      for (const [sectionIndex, section] of sections.entries()) {
        const rowIndex = section.items.findIndex((item) => item.id === itemId);
        if (rowIndex >= 0) return rowRef(sectionIndex, rowIndex);
      }
      return '';
    };
    const setStatus = (itemId: string, status: Status | null) => {
      commit(withStatus(latest.current.results, itemId, status));
      latest.current.announce(`${refOf(itemId)} ${status ? STATUS_LABELS[status] : 'no status'}`);
    };
    const move = (itemId: string, to: Move): boolean => {
      const target = targetRow(rowOrder(latest.current.sections), itemId, to);
      if (target) focusRow(rootRef.current, target);
      return target !== null;
    };
    const setRemainingOk = (sectionId: string) => {
      const { sections, results } = latest.current;
      const index = sections.findIndex((section) => section.id === sectionId);
      const section = sections[index];
      if (!section) return;
      const { results: next, count } = withRemainingOk(results, section);
      if (count === 0) return;
      commit(next);
      latest.current.announce(
        `Section ${sectionNumber(index)}: ${count === 1 ? '1 row' : `${count} rows`} set to OK`,
      );
    };

    return {
      run: (itemId, command) => {
        switch (command.kind) {
          case 'status':
            setStatus(itemId, command.status);
            if (advancesAfter(command.status)) move(itemId, 'next');
            return;
          case 'clear':
            return setStatus(itemId, null);
          case 'move':
            return void move(itemId, command.to);
          case 'comment':
            return focusComment(rootRef.current, itemId);
          case 'remaining': {
            // The focus stays on the row, ready for its next key.
            const section = latest.current.sections.find((candidate) =>
              candidate.items.some((item) => item.id === itemId),
            );
            if (section) setRemainingOk(section.id);
            return;
          }
        }
      },
      pick: (itemId, status) => {
        const current = latest.current.results[itemId]?.status;
        setStatus(itemId, current === status ? null : status);
        // Keys work on the row from here; the row is under the pointer, so no scrolling.
        focusRow(rootRef.current, itemId, false);
      },
      setText: (itemId, field, value) =>
        commit(withText(latest.current.results, itemId, field, value)),
      setSeverity: (itemId, severity) =>
        commit(withSeverity(latest.current.results, itemId, severity)),
      setRemainingOk,
      focusRow: (itemId) => focusRow(rootRef.current, itemId),
      finishRow: (itemId) => {
        if (!move(itemId, 'next')) focusRow(rootRef.current, itemId);
      },
      announce: (message) => latest.current.announce(message),
      showPhotos: (itemId) => latest.current.onShowPhotos(itemId),
      showGuide: (itemId) => latest.current.onShowGuide(itemId),
    };
  }, [rootRef]);
}

/**
 * Focuses a row and scrolls it into view by the smallest amount ('nearest'): moving down one row
 * at a time never makes the page jump. The page keeps rows clear of its sticky header with
 * `scroll-padding-top` on its scroller.
 */
function focusRow(root: HTMLElement | null, itemId: string, scroll = true): void {
  const row = root?.querySelector<HTMLElement>(`[id="row-${CSS.escape(itemId)}"]`);
  if (!row) return;
  // focus() alone would scroll the row to the middle of the screen in Chrome.
  row.focus({ preventScroll: true });
  if (scroll) row.scrollIntoView({ block: 'nearest' });
}

function focusComment(root: HTMLElement | null, itemId: string): void {
  const field = root?.querySelector<HTMLTextAreaElement>(`[data-comment="${CSS.escape(itemId)}"]`);
  if (!field) return;
  field.focus({ preventScroll: true });
  field.scrollIntoView({ block: 'nearest' });
  field.setSelectionRange(field.value.length, field.value.length);
}
