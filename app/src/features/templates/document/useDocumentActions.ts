import { rowRef, sectionNumber, type Item, type Section } from '@modig/shared';
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
  findRow,
  findSection,
  focusAfterRowDelete,
  focusAfterSectionDelete,
  moveRow,
  moveSection,
  renameSection,
  restoreRow,
  restoreSection,
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
  /** Puts the last deleted row or section back where it was, with the same ids. */
  undoDelete: (deleted: Deleted) => void;
};

/**
 * The last row or section deleted, so it can be put back: with the same ids, it keeps its history
 * (results and KPIs key on the row id). Offered until the next change to the structure.
 */
export type Deleted =
  | { kind: 'row'; label: string; sectionId: string; index: number; item: Item }
  | { kind: 'section'; label: string; index: number; section: Section };

/** Focus targets, plus two the UI needs: a section's ⋯ button, and a title with its text selected. */
type FocusRequest =
  FocusTarget | { kind: 'menu'; sectionId: string } | { kind: 'rename'; sectionId: string };

type Options = {
  sections: Section[];
  onChange: (sections: Section[]) => void;
  rootRef: RefObject<HTMLElement | null>;
  confirmDelete: (sectionId: string) => void;
  /** A delete that can be undone, or null once the structure changes otherwise. */
  onDeleted: (deleted: Deleted | null) => void;
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
  onDeleted,
}: Options): DocumentActions {
  const latest = useRef({ sections, onChange, confirmDelete, onDeleted });
  const pendingFocus = useRef<FocusRequest | null>(null);

  useLayoutEffect(() => {
    latest.current = { sections, onChange, confirmDelete, onDeleted };
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
    /** An edit of the structure (not of a text): it ends the undo of the last delete. */
    const restructure = (
      next: Section[],
      focus: FocusRequest | null = null,
      deleted: Deleted | null = null,
    ) => {
      if (next !== latest.current.sections) latest.current.onDeleted(deleted);
      commit(next, focus);
    };
    const removeSection = (sectionId: string) => {
      const sections = current();
      const index = findSection(sections, sectionId);
      const section = sections[index];
      if (!section) return;
      // Nothing worth an undo in an empty, untitled section.
      const deleted: Deleted | null =
        section.items.length > 0 || section.title.trim()
          ? { kind: 'section', label: `Section ${sectionNumber(index)}`, index, section }
          : null;
      restructure(
        deleteSection(sections, sectionId),
        focusAfterSectionDelete(sections, sectionId),
        deleted,
      );
    };

    return {
      setTitle: (sectionId, title) =>
        commit(renameSection(current(), sectionId, singleLine(title))),
      enterFromTitle: (sectionId) => {
        const first = current()[findSection(current(), sectionId)]?.items[0];
        if (first) return focusNow({ kind: 'row', itemId: first.id, caret: 'end' });
        const created = addRow(current(), sectionId, 0);
        if (created) {
          restructure(created.sections, { kind: 'row', itemId: created.id, caret: 'end' });
        }
      },
      renameSection: (sectionId) => focusNow({ kind: 'rename', sectionId }),
      duplicateSection: (sectionId) => {
        const created = duplicateSection(current(), sectionId);
        if (created) restructure(created.sections, { kind: 'rename', sectionId: created.id });
      },
      moveSectionBy: (sectionId, delta) =>
        restructure(
          moveSection(current(), sectionId, findSection(current(), sectionId) + delta),
          // Keep the moved section's ⋯ button focused and in view for the next Move up/down.
          { kind: 'menu', sectionId },
        ),
      moveSectionTo: (sectionId, index) => restructure(moveSection(current(), sectionId, index)),
      deleteSection: (sectionId) => {
        const section = current()[findSection(current(), sectionId)];
        if (!section) return;
        if (section.items.length > 0) latest.current.confirmDelete(sectionId);
        else removeSection(sectionId);
      },
      removeSection,
      addSection: () => {
        const created = addSection(current());
        restructure(created.sections, { kind: 'title', sectionId: created.id });
      },

      setText: (itemId, text) => commit(setRowText(current(), itemId, singleLine(text))),
      addRow: (sectionId) => {
        const section = current()[findSection(current(), sectionId)];
        const created = section && addRow(current(), sectionId, section.items.length);
        if (created) {
          restructure(created.sections, { kind: 'row', itemId: created.id, caret: 'end' });
        }
      },
      insertRowAfter: (itemId) => {
        const created = addRowAfter(current(), itemId);
        if (created) {
          restructure(created.sections, { kind: 'row', itemId: created.id, caret: 'end' });
        }
      },
      duplicateRow: (itemId) => {
        const created = duplicateRow(current(), itemId);
        if (created) {
          restructure(created.sections, { kind: 'row', itemId: created.id, caret: 'end' });
        }
      },
      deleteRow: (itemId) => {
        const sections = current();
        const at = findRow(sections, itemId);
        const section = at && sections[at.sectionIndex];
        const item = at && section?.items[at.rowIndex];
        if (!at || !section || !item) return;
        // An empty row (Enter, then Backspace) has nothing worth an undo.
        const deleted: Deleted | null =
          item.text.trim() || item.guide
            ? {
                kind: 'row',
                label: `Row ${rowRef(at.sectionIndex, at.rowIndex)}`,
                sectionId: section.id,
                index: at.rowIndex,
                item,
              }
            : null;
        restructure(deleteRow(sections, itemId), focusAfterRowDelete(sections, itemId), deleted);
      },
      moveRowTo: (itemId, position) => restructure(moveRow(current(), itemId, position)),
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
      undoDelete: (deleted) =>
        deleted.kind === 'row'
          ? restructure(restoreRow(current(), deleted.sectionId, deleted.index, deleted.item), {
              kind: 'row',
              itemId: deleted.item.id,
              caret: 'end',
            })
          : restructure(restoreSection(current(), deleted.index, deleted.section), {
              kind: 'title',
              sectionId: deleted.section.id,
            }),
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
