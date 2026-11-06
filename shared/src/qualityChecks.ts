/**
 * Quality checks: in-process checks along a machine's build ("Quality check – Pre start up"),
 * several per machine model. Each is a template of kind `quality` under its machine's final
 * inspection template (`parentId`), with a front page of its own and rows that say what to check,
 * how, against which references and in how much time. Pure helpers shared by the API and the app.
 */
import type { Item, QualityFront } from './schemas';

/** A new quality check's department until an admin picks another (the Quality department's). */
export const DEFAULT_QUALITY_DEPARTMENT = 'Quality';

const TITLE_PREFIX = 'Quality check';

/**
 * "Quality check – Pre start up" for the name "Pre start up"; '' when the name is blank. A name
 * that already starts with "Quality check" is not prefixed twice.
 */
export function qualityCheckTitle(front: Pick<QualityFront, 'name'>): string {
  const name = front.name.trim();
  if (!name) return '';
  return name.toLowerCase().startsWith(TITLE_PREFIX.toLowerCase())
    ? name
    : `${TITLE_PREFIX} – ${name}`;
}

/**
 * "Pre start up" for "Quality check – Pre start up": a quality check's title without the words
 * every title starts with, where space is short (a file name). Any other title stays as it is.
 */
export function qualityCheckShortName(title: string): string {
  const short = title.replace(/^\s*quality check\s*[–-]\s*/i, '').trim();
  return short || title.trim();
}

/** A new quality check's front page. */
export function newQualityFront(fields: { name: string }): QualityFront {
  return { name: fields.name.trim(), department: DEFAULT_QUALITY_DEPARTMENT };
}

/** Hours to one decimal, without the float noise of a sum (0.1 + 0.2 is 0.3). */
export function roundHours(hours: number): number {
  return Math.round(hours * 10) / 10;
}

/** The time of these rows together, in hours (one decimal). */
export function rowsHours(items: readonly Pick<Item, 'timeHours'>[]): number {
  return roundHours(items.reduce((sum, item) => sum + (item.timeHours ?? 0), 0));
}

/** The time of a whole checklist, in hours (one decimal). */
export function totalHours(
  sections: readonly { items: readonly Pick<Item, 'timeHours'>[] }[],
): number {
  return roundHours(sections.reduce((sum, section) => sum + rowsHours(section.items), 0));
}

/** "0.8 h", "12.0 h": always one decimal, as the time is entered. */
export function formatHours(hours: number): string {
  return `${roundHours(hours).toFixed(1)} h`;
}

/**
 * Hours as typed, "0.5", "0,5" (a Swedish keyboard's decimal comma) or "2": the number to one
 * decimal, null when it is not a number of hours (negative, too large or not a number), or
 * undefined when the field is empty.
 */
export function parseHours(text: string, max: number): number | null | undefined {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return undefined;
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === '.') return null;
  const hours = roundHours(Number(trimmed));
  return Number.isFinite(hours) && hours <= max ? hours : null;
}

/** Whether a row has anything in it besides its id (an empty one is deleted without an undo). */
export function rowHasContent(item: Item): boolean {
  return Boolean(
    item.text.trim() ||
    item.guide ||
    item.how?.trim() ||
    item.references?.length ||
    item.timeHours !== undefined,
  );
}
