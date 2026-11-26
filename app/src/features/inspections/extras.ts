/**
 * Extra findings (stored as `extraDeviations`): deviations not tied to a checklist row, added
 * from a section of the checklist or in the Deviation Summary (brief §5.3). Pure, immutable edits.
 */
import { DEFAULT_SEVERITY, newId, type ExtraDeviation } from '@modig/shared';

/** A new, empty one: of this section of the checklist, or a general one. */
export function newExtraDeviation(sectionId?: string): ExtraDeviation {
  return {
    id: newId(),
    ...(sectionId !== undefined && { sectionId }),
    description: '',
    severity: DEFAULT_SEVERITY,
  };
}

export type ExtraDeviationPatch = Partial<Omit<ExtraDeviation, 'id'>>;

/**
 * Applies the patch; an empty comment, resp, category or photo list is removed rather than
 * stored empty.
 */
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
    if (!next.category) delete next.category;
    if (!next.photos?.length) delete next.photos;
    return next;
  });
}

export function removeExtra(extras: readonly ExtraDeviation[], id: string): ExtraDeviation[] {
  return extras.filter((extra) => extra.id !== id);
}

/** Nothing typed, chosen or photographed: as it was when added. */
export function isEmptyExtra(extra: ExtraDeviation): boolean {
  return !(
    extra.description.trim() ||
    extra.comment?.trim() ||
    extra.resp?.trim() ||
    extra.category?.trim() ||
    extra.photos?.length
  );
}
