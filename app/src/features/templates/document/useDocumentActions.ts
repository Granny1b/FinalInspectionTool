import type { Section } from '@modig/shared';
import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import {
  addRow,
  addRowAfter,
  addSection,
  adjacentField,
  deleteRow,
  deleteSection,
  duplicateRow,
  duplicateSection,
  findSection,
  focusAfterRowDelete,
  focusAfterSectionDelete,
  moveRow,
  moveSection,
  renameSection,
  setRowText,
  singleLine,
  type Field,
  type FocusTarget,
  type RowPosition,
} from './ops';

/** Everything rows and sections can ask the document to do. The object is stable across renders. */
export type DocumentActions = {
  setTitle: (sectionId: string, title: string) => void;
  /** Enter in a title: go to the first row, or create it in an empty section. */
  enterFromTitle: (sectionId: string) => void;
  renameSection: (sectionId: string) => void;
  duplicateSection: (sectionId: string) => void;
  moveSectionBy: (sectionId: string, delta: -1 | 1) => void;
  moveSectionTo: (sectionId: string, index: number) => void;
  /** Asks for confirmation first when the section has rows. */
  deleteSection: (sectionId: string) => void;
  /** Deletes without asking (after the confirmation). */
  removeSection: (sectionId: string) => void;
  addSection: () => void;

  setText: (itemId: string, text: string) => void;
  addRow: (sectionId: string) => void;
  /** Enter in a row. */
  insertRowAfter: (itemId: string) => void;
  duplicateRow: (itemId: string) => void;
  deleteRow: (itemId: string) => void;
  moveRowTo: (itemId: string, position: RowPosition) => void;
  /** ArrowUp/ArrowDown at the edge of a line; false when there is nowhere to go. */
  moveFocus: (from: Field, direction: 'up' | 'down') => boolean;
  focusSectionMenu: (sectionId: string) => void;
};

/** Focus targets, plus two the UI needs: a section's ⋯ button, and a title with its text selected. */
type FocusRequest =
  FocusTarget | { kind: 'menu'; sectionId: string } | { kind: 'rename'; sectionId: string };

type Options = {
  sections: Section[];
  onChange: (sections: Section[]) => void;
  rootRef: RefObject<HTMLElement | null>;
  confirmDelete: (sectionId: string) => void;
};

/**
 * Stable callbacks over the latest sections, so memoised rows never re-render because a callback
 * changed. Focus that depends on an edit (a new row, a moved section) is applied after the
 * re-render that shows it.
 */
export function useDocumentActions({
  sections,
  onChange,
  rootRef,
  confirmDelete,
}: Options): DocumentActions {
  const latest = useRef({ sections, onChange, confirmDelete });
  const pendingFocus = useRef<FocusRequest | null>(null);

  useLayoutEffect(() => {
    latest.current = { sections, onChange, confirmDelete };
    const request = pendingFocus.current;
    if (request && focusElement(rootRef.current, request)) pendingFocus.current = null;
  });

  return useMemo<DocumentActions>(() => {
    const current = () => latest.current.sections;
    const focusNow = (request: FocusRequest | null) => {
      if (request) focusElement(rootRef.current, request);
    };
    /** Saves an edit and moves focus once it is on screen. */
    const commit = (next: Section[], focus: FocusRequest | null = null) => {
      if (next === latest.current.sections) return focusNow(focus);
      // Further edits in the same event build on this one, even before the parent re-renders.
      latest.current = { ...latest.current, sections: next };
      if (focus) pendingFocus.current = focus;
      latest.current.onChange(next);
    };
    const removeSection = (sectionId: string) =>
      commit(deleteSection(current(), sectionId), focusAfterSectionDelete(current(), sectionId));

    return {
      setTitle: (sectionId, title) =>
        commit(renameSection(current(), sectionId, singleLine(title))),
      enterFromTitle: (sectionId) => {
        const first = current()[findSection(current(), sectionId)]?.items[0];
        if (first) return focusNow({ kind: 'row', itemId: first.id, caret: 'end' });
        const created = addRow(current(), sectionId, 0);
        if (created) commit(created.sections, { kind: 'row', itemId: created.id, caret: 'end' });
      },
      renameSection: (sectionId) => focusNow({ kind: 'rename', sectionId }),
      duplicateSection: (sectionId) => {
        const created = duplicateSection(current(), sectionId);
        if (created) commit(created.sections, { kind: 'rename', sectionId: created.id });
      },
      moveSectionBy: (sectionId, delta) =>
        commit(
          moveSection(current(), sectionId, findSection(current(), sectionId) + delta),
          // Keep the moved section's ⋯ button focused and in view for the next Move up/down.
          { kind: 'menu', sectionId },
        ),
      moveSectionTo: (sectionId, index) => commit(moveSection(current(), sectionId, index)),
      deleteSection: (sectionId) => {
        const section = current()[findSection(current(), sectionId)];
        if (!section) return;
        if (section.items.length > 0) latest.current.confirmDelete(sectionId);
        else removeSection(sectionId);
      },
      removeSection,
      addSection: () => {
        const created = addSection(current());
        commit(created.sections, { kind: 'title', sectionId: created.id });
      },

      setText: (itemId, text) => commit(setRowText(current(), itemId, singleLine(text))),
      addRow: (sectionId) => {
        const section = current()[findSection(current(), sectionId)];
        const created = section && addRow(current(), sectionId, section.items.length);
        if (created) commit(created.sections, { kind: 'row', itemId: created.id, caret: 'end' });
      },
      insertRowAfter: (itemId) => {
        const created = addRowAfter(current(), itemId);
        if (created) commit(created.sections, { kind: 'row', itemId: created.id, caret: 'end' });
      },
      duplicateRow: (itemId) => {
        const created = duplicateRow(current(), itemId);
        if (created) commit(created.sections, { kind: 'row', itemId: created.id, caret: 'end' });
      },
      deleteRow: (itemId) =>
        commit(deleteRow(current(), itemId), focusAfterRowDelete(current(), itemId)),
      moveRowTo: (itemId, position) => commit(moveRow(current(), itemId, position)),
      moveFocus: (from, direction) => {
        const next = adjacentField(current(), from, direction);
        if (!next) return false;
        focusNow(
          next.kind === 'row'
            ? { ...next, caret: direction === 'up' ? 'end' : 'start' }
            : { kind: 'title', sectionId: next.sectionId },
        );
        return true;
      },
      focusSectionMenu: (sectionId) => focusNow({ kind: 'menu', sectionId }),
    };
  }, [rootRef]);
}

/** Finds the element for a focus request inside the document and focuses it. */
function focusElement(root: HTMLElement | null, request: FocusRequest): boolean {
  const selector =
    request.kind === 'row'
      ? `[data-item-text="${CSS.escape(request.itemId)}"]`
      : request.kind === 'menu'
        ? `[data-section-menu="${CSS.escape(request.sectionId)}"]`
        : request.kind === 'add-section'
          ? '[data-add-section]'
          : `[data-section-title="${CSS.escape(request.sectionId)}"]`;
  const element = root?.querySelector<HTMLElement>(selector);
  if (!element) return false;
  element.focus();
  // focus() doesn't scroll when the element already had focus (a section moved with its ⋯ button).
  element.scrollIntoView({ block: 'nearest' });
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    if (request.kind === 'rename') element.select();
    else {
      const caret = request.kind === 'row' && request.caret === 'start' ? 0 : element.value.length;
      element.setSelectionRange(caret, caret);
    }
  }
  return true;
}
