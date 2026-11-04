import {
  rowRef,
  sectionNumber,
  sectionSpareRows,
  type Guide,
  type Item,
  type Section,
} from '@modig/shared';
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
  setRowGuide,
  setRowText,
  setSpareRows,
  singleLine,
  spareLineAfterDelete,
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
  /** One more spare line at the end of the section. */
  addSpareRow: (sectionId: string) => void;
  /** One spare line fewer (they are all alike); can be undone. */
  deleteSpareRow: (sectionId: string, offset: number) => void;
  focusSectionMenu: (sectionId: string) => void;
  /** Puts the last deleted row, section or spare line back where it was, with the same ids. */
  undoDelete: (deleted: Deleted) => void;
  /** Opens the row's guide in the guide editor. */
  openGuide: (itemId: string) => void;
  /** What the guide editor saved: the row's new guide, or undefined to remove it. */
  setGuide: (itemId: string, guide: Guide | undefined) => void;
};

/**
 * The last row or section deleted, so it can be put back: with the same ids, it keeps its history
 * (results and KPIs key on the row id). Offered until the next change to the structure.
 */
export type Deleted =
  | { kind: 'row'; label: string; sectionId: string; index: number; item: Item }
  | { kind: 'section'; label: string; index: number; section: Section }
  /** `spareRows`: the section's own count before, undefined when it followed the template's. */
  | { kind: 'spare'; label: string; sectionId: string; spareRows: number | undefined };

/** Focus targets, plus two the UI needs: a section's ⋯ button, and a title with its text selected. */
type FocusRequest =
  | FocusTarget
  | { kind: 'menu'; sectionId: string }
  | { kind: 'rename'; sectionId: string }
  /** A spare line's delete button, or the section's "Add spare line". */
  | { kind: 'spare'; sectionId: string; offset: number }
  | { kind: 'add-spare'; sectionId: string };

type Options = {
  sections: Section[];
  onChange: (sections: Section[]) => void;
  /** The template's spare lines per section, for sections without a number of their own. */
  spareRowsPerSection: number;
  rootRef: RefObject<HTMLElement | null>;
  confirmDelete: (sectionId: string) => void;
  /** A delete that can be undone, or null once the structure changes otherwise. */
  onDeleted: (deleted: Deleted | null) => void;
  onOpenGuide: (itemId: string) => void;
};

/**
 * Stable callbacks over the latest sections, so memoised rows never re-render because a callback
 * changed. Focus that depends on an edit (a new row, a moved section) is applied after the
 * re-render that shows it.
 */
export function useDocumentActions({
  sections,
  onChange,
  spareRowsPerSection,
  rootRef,
  confirmDelete,
  onDeleted,
  onOpenGuide,
}: Options): DocumentActions {
  const latest = useRef({
    sections,
    onChange,
    spareRowsPerSection,
    confirmDelete,
    onDeleted,
    onOpenGuide,
  });
  const pendingFocus = useRef<FocusRequest | null>(null);

  useLayoutEffect(() => {
    latest.current = {
      sections,
      onChange,
      spareRowsPerSection,
      confirmDelete,
      onDeleted,
      onOpenGuide,
    };
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
    /** A section and the spare lines it shows. */
    const spareRowsOf = (sectionId: string) => {
      const index = findSection(current(), sectionId);
      const section = current()[index];
      if (!section) return null;
      const { spareRowsPerSection: perSection } = latest.current;
      return {
        index,
        section,
        count: sectionSpareRows(section, { spareRowsPerSection: perSection }),
      };
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
      addSpareRow: (sectionId) => {
        const found = spareRowsOf(sectionId);
        // Focus stays on "Add spare line", which moves down a line.
        if (found) restructure(setSpareRows(current(), sectionId, found.count + 1));
      },
      deleteSpareRow: (sectionId, offset) => {
        const found = spareRowsOf(sectionId);
        if (!found || found.count === 0) return;
        const { index, section, count } = found;
        const next = spareLineAfterDelete(count, offset);
        restructure(
          setSpareRows(current(), sectionId, count - 1),
          next === null
            ? { kind: 'add-spare', sectionId }
            : { kind: 'spare', sectionId, offset: next },
          {
            kind: 'spare',
            label: `Spare line ${rowRef(index, section.items.length + offset)}`,
            sectionId,
            spareRows: section.spareRows,
          },
        );
      },
      focusSectionMenu: (sectionId) => focusNow({ kind: 'menu', sectionId }),
      undoDelete: (deleted) => {
        if (deleted.kind === 'row') {
          return restructure(
            restoreRow(current(), deleted.sectionId, deleted.index, deleted.item),
            {
              kind: 'row',
              itemId: deleted.item.id,
              caret: 'end',
            },
          );
        }
        if (deleted.kind === 'spare') {
          return restructure(setSpareRows(current(), deleted.sectionId, deleted.spareRows), {
            kind: 'add-spare',
            sectionId: deleted.sectionId,
          });
        }
        restructure(restoreSection(current(), deleted.index, deleted.section), {
          kind: 'title',
          sectionId: deleted.section.id,
        });
      },
      openGuide: (itemId) => latest.current.onOpenGuide(itemId),
      // Not a change of structure: the undo of the last delete stays on offer.
      setGuide: (itemId, guide) => commit(setRowGuide(current(), itemId, guide)),
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
          : request.kind === 'spare'
            ? `[data-spare-delete="${CSS.escape(`${request.sectionId}:${request.offset}`)}"]`
            : request.kind === 'add-spare'
              ? `[data-add-spare="${CSS.escape(request.sectionId)}"]`
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
