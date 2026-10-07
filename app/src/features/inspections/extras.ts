/**
 * Extra deviations: findings not tied to a checklist row, added and edited in the Deviation
 * Summary (brief §5.3). Pure, immutable edits.
 */
import { DEFAULT_SEVERITY, newId, type ExtraDeviation } from '@modig/shared';

export function newExtraDeviation(): ExtraDeviation {
  return { id: newId(), description: '', severity: DEFAULT_SEVERITY };
}

export type ExtraDeviationPatch = Partial<Omit<ExtraDeviation, 'id'>>;

/** Applies the patch; an empty comment or resp is removed rather than stored as ''. */
export function updateExtra(
  extras: readonly ExtraDeviation[],
  id: string,
  patch: ExtraDeviationPatch,
): ExtraDeviation[] {
  return extras.map((extra) => {
    if (extra.id !== id) return extra;
    const next: ExtraDeviation = { ...extra, ...patch };
    if (!next.comment) delete next.comment;
    if (!next.resp) delete next.resp;
    return next;
  });
}

export function removeExtra(extras: readonly ExtraDeviation[], id: string): ExtraDeviation[] {
  return extras.filter((extra) => extra.id !== id);
}
