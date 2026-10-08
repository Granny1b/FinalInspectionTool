/**
 * Pure, immutable edits of a template's sections (brief §5.2).
 *
 * Every function leaves its input untouched. Sections and items that don't change keep their
 * object identity, so memoised rows skip re-rendering while someone types. Ids are stable
 * forever: editing and moving never change one; only new and duplicated sections and rows get
 * fresh ids. An unknown id, or a move to where the row already is, returns the input array itself,
 * so callers can skip a pointless save with `next === sections`.
 */
import { newId, type Guide, type Item, type Section } from '@modig/shared';

/** Where a row ends up: the target section and its index there, counted without the moved row. */
export type RowPosition = { sectionId: string; index: number };

/** Something the editor can move focus to after an edit. */
export type FocusTarget =
  | { kind: 'row'; itemId: string; caret: 'start' | 'end' }
  | { kind: 'title'; sectionId: string }
  | { kind: 'add-section' };

/** The editable lines of the document in reading order: each section title, then its rows. */
export type Field = { kind: 'title'; sectionId: string } | { kind: 'row'; itemId: string };

/** Created sections/rows come back with their new id, so the editor can focus them. */
export type Created = { sections: Section[]; id: string };

// ---------------------------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------------------------

export function findSection(sections: Section[], sectionId: string): number {
  return sections.findIndex((section) => section.id === sectionId);
}

export function findRow(
  sections: Section[],
  itemId: string,
): { sectionIndex: number; rowIndex: number } | null {
  for (const [sectionIndex, section] of sections.entries()) {
    const rowIndex = section.items.findIndex((item) => item.id === itemId);
    if (rowIndex >= 0) return { sectionIndex, rowIndex };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------------------------

/** Appends an empty, untitled section. */
export function addSection(sections: Section[]): Created {
  const section: Section = { id: newId(), title: '', items: [] };
  return { sections: [...sections, section], id: section.id };
}

export function renameSection(sections: Section[], sectionId: string, title: string): Section[] {
  return updateSection(sections, sectionId, (section) =>
    section.title === title ? section : { ...section, title },
  );
}

/** Deep copy (guides included) right after the original, with fresh section and item ids. */
export function duplicateSection(sections: Section[], sectionId: string): Created | null {
  const index = findSection(sections, sectionId);
  const original = sections[index];
  if (!original) return null;
  const copy: Section = { ...original, id: newId(), items: original.items.map(copyItem) };
  return { sections: insertAt(sections, index + 1, copy), id: copy.id };
}

export function deleteSection(sections: Section[], sectionId: string): Section[] {
  const index = findSection(sections, sectionId);
  return index < 0 ? sections : sections.filter((_, i) => i !== index);
}

/** Undo of a delete: puts the section object back (same ids) at `index` (clamped). */
export function restoreSection(sections: Section[], index: number, section: Section): Section[] {
  if (findSection(sections, section.id) >= 0) return sections;
  return insertAt(sections, clamp(index, 0, sections.length), section);
}

/** Moves a section to `toIndex` (clamped), as Move up/down and drag and drop do. */
export function moveSection(sections: Section[], sectionId: string, toIndex: number): Section[] {
  const from = findSection(sections, sectionId);
  const section = sections[from];
  if (!section) return sections;
  const to = clamp(toIndex, 0, sections.length - 1);
  if (to === from) return sections;
  return insertAt(
    sections.filter((_, i) => i !== from),
    to,
    section,
  );
}

// ---------------------------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------------------------

/** Inserts an empty row at `index` (clamped) of a section. */
export function addRow(sections: Section[], sectionId: string, index: number): Created | null {
  const sectionIndex = findSection(sections, sectionId);
  const section = sections[sectionIndex];
  if (!section) return null;
  const item: Item = { id: newId(), text: '' };
  const at = clamp(index, 0, section.items.length);
  return {
    sections: replaceAt(sections, sectionIndex, {
      ...section,
      items: insertAt(section.items, at, item),
    }),
    id: item.id,
  };
}

/** Enter in a row: a new empty row right after it. */
export function addRowAfter(sections: Section[], itemId: string): Created | null {
  const at = locateRow(sections, itemId);
  return at ? addRow(sections, at.section.id, at.rowIndex + 1) : null;
}

export function setRowText(sections: Section[], itemId: string, text: string): Section[] {
  return updateItem(sections, itemId, (item) => (item.text === text ? item : { ...item, text }));
}

/** Gives a row the guide from the guide editor, or (undefined) takes its guide away. */
export function setRowGuide(
  sections: Section[],
  itemId: string,
  guide: Guide | undefined,
): Section[] {
  return updateItem(sections, itemId, (item) => {
    if (item.guide === guide) return item;
    const { guide: _previous, ...rest } = item;
    return guide ? { ...rest, guide } : rest;
  });
}

/** Deep copy (guide included) right after the original, with a fresh id. */
export function duplicateRow(sections: Section[], itemId: string): Created | null {
  const at = locateRow(sections, itemId);
  if (!at) return null;
  const copy = copyItem(at.item);
  return {
    sections: replaceAt(sections, at.sectionIndex, {
      ...at.section,
      items: insertAt(at.section.items, at.rowIndex + 1, copy),
    }),
    id: copy.id,
  };
}

export function deleteRow(sections: Section[], itemId: string): Section[] {
  const at = locateRow(sections, itemId);
  if (!at) return sections;
  return replaceAt(sections, at.sectionIndex, {
    ...at.section,
    items: at.section.items.filter((_, i) => i !== at.rowIndex),
  });
}

/**
 * Undo of a delete: puts the item object back (same id, text and guide) at `index` (clamped) of
 * its section. Returns the input when the section is gone or the row is already there.
 */
export function restoreRow(
  sections: Section[],
  sectionId: string,
  index: number,
  item: Item,
): Section[] {
  const sectionIndex = findSection(sections, sectionId);
  const section = sections[sectionIndex];
  if (!section || findRow(sections, item.id)) return sections;
  return replaceAt(sections, sectionIndex, {
    ...section,
    items: insertAt(section.items, clamp(index, 0, section.items.length), item),
  });
}

/**
 * Moves a row within its section or into another one (an empty one too). The item object itself
 * is moved, so its id, text and guide are kept. `to.index` is clamped to the target's length.
 */
export function moveRow(sections: Section[], itemId: string, to: RowPosition): Section[] {
  const from = locateRow(sections, itemId);
  const targetIndex = findSection(sections, to.sectionId);
  if (!from || targetIndex < 0) return sections;

  const removed = replaceAt(sections, from.sectionIndex, {
    ...from.section,
    items: from.section.items.filter((_, i) => i !== from.rowIndex),
  });
  const target = removed[targetIndex];
  if (!target) return sections;
  const index = clamp(to.index, 0, target.items.length);
  if (targetIndex === from.sectionIndex && index === from.rowIndex) return sections;
  return replaceAt(removed, targetIndex, {
    ...target,
    items: insertAt(target.items, index, from.item),
  });
}

// ---------------------------------------------------------------------------------------------
// Focus
// ---------------------------------------------------------------------------------------------

/**
 * Where focus goes when a row is deleted (Backspace in an empty row, or its Delete button): the
 * end of the previous row, else the start of the next one, else the section title.
 * Call it before deleting.
 */
export function focusAfterRowDelete(sections: Section[], itemId: string): FocusTarget | null {
  const at = locateRow(sections, itemId);
  if (!at) return null;
  const previous = at.section.items[at.rowIndex - 1];
  if (previous) return { kind: 'row', itemId: previous.id, caret: 'end' };
  const next = at.section.items[at.rowIndex + 1];
  if (next) return { kind: 'row', itemId: next.id, caret: 'start' };
  return { kind: 'title', sectionId: at.section.id };
}

/** Where focus goes when a section is deleted: the next title, else the previous, else "Add section". */
export function focusAfterSectionDelete(
  sections: Section[],
  sectionId: string,
): FocusTarget | null {
  const index = findSection(sections, sectionId);
  if (index < 0) return null;
  const neighbour = sections[index + 1] ?? sections[index - 1];
  return neighbour ? { kind: 'title', sectionId: neighbour.id } : { kind: 'add-section' };
}

/** ArrowUp/ArrowDown between lines: the previous/next field in reading order, or null at an end. */
export function adjacentField(
  sections: Section[],
  field: Field,
  direction: 'up' | 'down',
): Field | null {
  const fields: Field[] = sections.flatMap((section) => [
    { kind: 'title', sectionId: section.id } as const,
    ...section.items.map((item) => ({ kind: 'row', itemId: item.id }) as const),
  ]);
  const index = fields.findIndex((candidate) =>
    candidate.kind === 'title'
      ? field.kind === 'title' && candidate.sectionId === field.sectionId
      : field.kind === 'row' && candidate.itemId === field.itemId,
  );
  if (index < 0) return null;
  return fields[direction === 'up' ? index - 1 : index + 1] ?? null;
}

// ---------------------------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------------------------

/** Checkpoints and titles are one line on paper: pasted line breaks become single spaces. */
export function singleLine(text: string): string {
  return text.replace(/[ \t]*[\r\n]+[ \t]*/g, ' ');
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

/** A row together with its section, or null for an unknown id. */
function locateRow(sections: Section[], itemId: string) {
  const at = findRow(sections, itemId);
  const section = at ? sections[at.sectionIndex] : undefined;
  const item = at ? section?.items[at.rowIndex] : undefined;
  return at && section && item ? { ...at, section, item } : null;
}

function copyItem(item: Item): Item {
  return { ...structuredClone(item), id: newId() };
}

function updateSection(
  sections: Section[],
  sectionId: string,
  update: (section: Section) => Section,
): Section[] {
  const index = findSection(sections, sectionId);
  const section = sections[index];
  if (!section) return sections;
  const next = update(section);
  return next === section ? sections : replaceAt(sections, index, next);
}

function updateItem(sections: Section[], itemId: string, update: (item: Item) => Item): Section[] {
  const at = locateRow(sections, itemId);
  if (!at) return sections;
  const next = update(at.item);
  if (next === at.item) return sections;
  return replaceAt(sections, at.sectionIndex, {
    ...at.section,
    items: replaceAt(at.section.items, at.rowIndex, next),
  });
}

function replaceAt<T>(list: T[], index: number, value: T): T[] {
  return list.map((existing, i) => (i === index ? value : existing));
}

function insertAt<T>(list: T[], index: number, value: T): T[] {
  return [...list.slice(0, index), value, ...list.slice(index)];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
