/**
 * Display numbers are derived from position and never stored (brief §4).
 * Sections: 1, 2, 3… Rows: a…z, aa, ab… (spreadsheet-style bijective base-26).
 */
import type { Section } from './schemas';

/** 0 → "a", 25 → "z", 26 → "aa", 27 → "ab", 701 → "zz", 702 → "aaa". */
export function rowLetter(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError(`rowLetter: index must be a non-negative integer, got ${index}`);
  }
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(97 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** 0-based section index → 1-based section number. */
export function sectionNumber(sectionIndex: number): number {
  return sectionIndex + 1;
}

/** "3.c" for section index 2, row index 2. */
export function rowRef(sectionIndex: number, rowIndex: number): string {
  return `${sectionNumber(sectionIndex)}.${rowLetter(rowIndex)}`;
}

/** "D-01", "D-02"… "D-99", "D-100". `index` is 0-based. */
export function deviationNumber(index: number): string {
  return `D-${String(index + 1).padStart(2, '0')}`;
}

/** "3.c Main Cabinet - Verify labeling on cables and components" */
export function refWithText(ref: string, text: string): string {
  return text ? `${ref} ${text}` : ref;
}

export type IndexedItem = {
  itemId: string;
  ref: string;
  text: string;
  sectionId: string;
  sectionTitle: string;
  sectionIndex: number;
  rowIndex: number;
};

/**
 * Walk sections in display order and return every item with its derived ref.
 * Order of the returned array = print/display order.
 */
export function indexItems(sections: readonly Section[]): IndexedItem[] {
  const out: IndexedItem[] = [];
  sections.forEach((section, sectionIndex) => {
    section.items.forEach((item, rowIndex) => {
      out.push({
        itemId: item.id,
        ref: rowRef(sectionIndex, rowIndex),
        text: item.text,
        sectionId: section.id,
        sectionTitle: section.title,
        sectionIndex,
        rowIndex,
      });
    });
  });
  return out;
}
