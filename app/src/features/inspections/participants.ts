/** The front page's participants: typed one at a time, or pasted as a list. */

/** At most this long per name (InspectionFrontSchema). */
export const MAX_NAME_LENGTH = 200;

/** "Anna Berg, Erik Lind; Lars" → three names. Commas, semicolons and line breaks separate. */
export function splitNames(text: string): string[] {
  return text
    .split(/[,;\r\n]+/)
    .map((name) => name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH))
    .filter(Boolean);
}

/** Adds the names not listed yet (ignoring case), keeping the order. Unchanged → same array. */
export function addNames(list: string[], names: readonly string[]): string[] {
  const seen = new Set(list.map((name) => name.toLocaleLowerCase('sv')));
  const added: string[] = [];
  for (const name of names) {
    const key = name.toLocaleLowerCase('sv');
    if (seen.has(key)) continue;
    seen.add(key);
    added.push(name);
  }
  return added.length > 0 ? [...list, ...added] : list;
}
