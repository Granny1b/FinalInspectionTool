/** A quality check's row's references: typed one at a time, or pasted as a list. */
import { MAX_REFERENCES } from '@modig/shared';

/** At most this long per reference (ReferenceSchema). */
export const MAX_REFERENCE_LENGTH = 100;

/** "ISO 12100, ISO 7010; IEC 60204-1" → three references. Commas, semicolons and lines separate. */
export function splitReferences(text: string): string[] {
  return text
    .split(/[,;\r\n]+/)
    .map((reference) => reference.replace(/\s+/g, ' ').trim().slice(0, MAX_REFERENCE_LENGTH))
    .filter(Boolean);
}

/**
 * Adds the references not listed yet (ignoring case), keeping the order, up to MAX_REFERENCES.
 * Unchanged → the same array.
 */
export function addReferences(list: string[], references: readonly string[]): string[] {
  const seen = new Set(list.map((reference) => reference.toLocaleLowerCase('sv')));
  const added: string[] = [];
  for (const reference of references) {
    const key = reference.toLocaleLowerCase('sv');
    if (seen.has(key) || list.length + added.length >= MAX_REFERENCES) continue;
    seen.add(key);
    added.push(reference);
  }
  return added.length > 0 ? [...list, ...added] : list;
}
