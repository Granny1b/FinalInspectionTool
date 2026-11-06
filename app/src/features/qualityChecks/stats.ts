import { formatHours, rowsHours, totalHours, type Item, type Section } from '@modig/shared';
import { rowCountText } from '../templates/document/ops';

/** "5 rows · 0.8 h": a section's size and time, in its header. */
export function sectionStats(items: readonly Item[]): string {
  return `${rowCountText(items.length)} · ${formatHours(rowsHours(items))}`;
}

/** "0.8 h": the time of a whole quality check. */
export function checklistHours(sections: readonly Section[]): string {
  return formatHours(totalHours(sections));
}
