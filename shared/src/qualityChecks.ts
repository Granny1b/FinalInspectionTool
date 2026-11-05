/**
 * Quality checks: checks done at positions along a machine's build ("QC4 · Pre start up"),
 * several per machine model. Each is a template of kind `quality` under its machine's final
 * inspection template (`parentId`), with a front page of its own and rows that say what to check,
 * how, against which references and in how much time. Pure helpers shared by the API and the app.
 */
import type { Item, QualityFront } from './schemas';

/** A new quality check's department until an admin picks another (the Quality department's). */
export const DEFAULT_QUALITY_DEPARTMENT = 'Quality';

/** "QC4 · Pre start up"; "QC4" without an operation; '' when both are blank. */
export function qualityCheckTitle(front: Pick<QualityFront, 'position' | 'operation'>): string {
  return [front.position.trim(), front.operation.trim()].filter(Boolean).join(' · ');
}

/** A new quality check's front page. */
export function newQualityFront(fields: {
  position: string;
  operation: string;
  madeBy?: string;
  date?: string;
}): QualityFront {
  return {
    position: fields.position.trim(),
    operation: fields.operation.trim(),
    department: DEFAULT_QUALITY_DEPARTMENT,
    documentNumber: '',
    madeBy: fields.madeBy?.trim() ?? '',
    date: fields.date ?? '',
  };
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
