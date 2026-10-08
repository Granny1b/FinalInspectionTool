/** Small pure helpers for the Deviations tab and the checklist's photo counts. */
import type { InspectionDeviation } from '@modig/shared';

/** "1 photo", "2 photos"; null for none. */
export function photoCountText(count: number): string | null {
  if (count === 0) return null;
  return count === 1 ? '1 photo' : `${count} photos`;
}

/** Removing an extra deviation asks first only if something was typed or photographed. */
export function asksBeforeRemoving(deviation: InspectionDeviation): boolean {
  return Boolean(
    deviation.text.trim() ||
    deviation.comment.trim() ||
    deviation.resp.trim() ||
    deviation.photos.length > 0,
  );
}

/** The question's text: what goes, named by what was typed, and its photos. */
export function removalMessage({ text, comment, resp, photos }: InspectionDeviation): string {
  const name = text.trim() || comment.trim() || resp.trim();
  const withPhotos =
    photos.length === 0
      ? ''
      : photos.length === 1
        ? ', with its photo'
        : `, with its ${photos.length} photos`;
  return name
    ? `“${name}” is removed from the summary${withPhotos}.`
    : `It is removed from the summary${withPhotos}.`;
}
