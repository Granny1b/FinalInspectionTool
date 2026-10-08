/**
 * Pure, immutable edits of an inspection's results (keyed by Item.id).
 *
 * Rows that don't change keep their object identity, so memoised rows skip re-rendering. An edit
 * that changes nothing returns the input itself, so callers can skip a pointless save with
 * `next === results`. A row left with nothing in it is removed rather than stored as `{}`.
 */
import type { AnnotatedImage, RowResult, Section, Severity, Status } from '@modig/shared';

export type Results = Record<string, RowResult>;

/**
 * Sets a row's status, or clears it with null. Comment and resp stay; the severity goes with
 * NOK, because it means nothing on an OK or N/A row.
 */
export function withStatus(results: Results, itemId: string, status: Status | null): Results {
  const current = results[itemId] ?? {};
  if ((current.status ?? null) === status) return results;
  const { status: _previous, severity, ...rest } = current;
  if (status === null) return put(results, itemId, rest);
  return put(
    results,
    itemId,
    status === 'NOK' && severity ? { ...rest, status, severity } : { ...rest, status },
  );
}

/** Sets a row's comment or resp exactly as typed; an empty value removes it. */
export function withText(
  results: Results,
  itemId: string,
  field: 'comment' | 'resp',
  value: string,
): Results {
  const current = results[itemId] ?? {};
  if ((current[field] ?? '') === value) return results;
  const { [field]: _previous, ...rest } = current;
  return put(results, itemId, value ? { ...rest, [field]: value } : rest);
}

/**
 * Sets a row's deviation photos (added on the Deviations tab); none removes them. Like the
 * comment, they stay when the status changes, so a NOK set to OK by mistake loses nothing.
 */
export function withPhotos(results: Results, itemId: string, photos: AnnotatedImage[]): Results {
  const current = results[itemId] ?? {};
  if (current.photos === photos || (!current.photos?.length && !photos.length)) return results;
  const { photos: _previous, ...rest } = current;
  return put(results, itemId, photos.length > 0 ? { ...rest, photos } : rest);
}

export function withSeverity(results: Results, itemId: string, severity: Severity): Results {
  const current = results[itemId] ?? {};
  if (current.severity === severity) return results;
  return put(results, itemId, { ...current, severity });
}

/** Rows of the section that have no status yet. */
export function rowsWithoutStatus(section: Section, results: Results): number {
  return section.items.filter((item) => !results[item.id]?.status).length;
}

/**
 * "Set remaining to OK" (brief §5.3): every row of the section without a status becomes OK, in
 * one edit. Rows that already have a status, NOK included, are left alone.
 */
export function withRemainingOk(
  results: Results,
  section: Section,
): { results: Results; count: number } {
  let next = results;
  let count = 0;
  for (const item of section.items) {
    if (next[item.id]?.status) continue;
    next = withStatus(next, item.id, 'OK');
    count += 1;
  }
  return { results: next, count };
}

function put(results: Results, itemId: string, result: RowResult): Results {
  if (Object.keys(result).length > 0) return { ...results, [itemId]: result };
  const { [itemId]: _removed, ...others } = results;
  return others;
}
