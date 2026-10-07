/**
 * Moving between rows: one list in checklist order, across sections, so ↓ on the last row of a
 * section lands on the first row of the next.
 */
import type { Section, Status } from '@modig/shared';
import type { Move } from './keys';

/** Every row id in checklist order. */
export function rowOrder(sections: readonly Section[]): string[] {
  return sections.flatMap((section) => section.items.map((item) => item.id));
}

/** The row a move lands on, or null when there is nowhere to go (or the row is unknown). */
export function targetRow(order: readonly string[], from: string, move: Move): string | null {
  const index = order.indexOf(from);
  if (index < 0) return null;
  const target =
    move === 'first'
      ? 0
      : move === 'last'
        ? order.length - 1
        : move === 'next'
          ? index + 1
          : index - 1;
  return target === index ? null : (order[target] ?? null);
}

/**
 * Fast transcription: most rows are OK or N/A, so setting either by key moves on to the next row.
 * NOK stays, because a NOK row usually gets a comment and a resp next (C or Tab).
 */
export function advancesAfter(status: Status): boolean {
  return status !== 'NOK';
}
