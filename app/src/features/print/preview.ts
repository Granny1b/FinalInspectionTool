import type { Inspection, InspectionDraftInput } from '@modig/shared';

/** An A4 sheet's width in CSS pixels (210 mm at 96 px per inch), as print.css lays it out. */
export const SHEET_WIDTH_PX = (210 * 96) / 25.4;

/**
 * The inspection as the page shows it, for a preview: the stored one with the edits on screen
 * (saved or not) and the state the server last gave. The model and the frozen checklist are the
 * server's; the page never edits them.
 */
export function inspectionOnScreen(
  inspection: Inspection,
  draft: InspectionDraftInput,
  server: Pick<Inspection, 'state' | 'finalisedAt' | 'finalisedBy'>,
): Inspection {
  return {
    ...inspection,
    ...server,
    front: { ...draft.front, modelCode: inspection.front.modelCode },
    results: draft.results,
    extraDeviations: draft.extraDeviations,
  };
}

/** About 300 px wide for a sheet: a phone held upright still shows the page's layout. */
const MIN_SCALE = 0.375;

/**
 * How much the sheets are scaled to fit `width` (CSS pixels): never above their real size, and
 * never so small that nothing can be read, so a narrower screen scrolls sideways instead.
 */
export function fitScale(width: number): number {
  if (!(width > 0)) return 1;
  return Math.min(1, Math.max(MIN_SCALE, width / SHEET_WIDTH_PX));
}

/**
 * Ctrl+P (⌘P on a Mac), with or without Shift: the browser's Print, which over the preview would
 * print the page behind it.
 */
export function isPrintShortcut(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>,
): boolean {
  return (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'p';
}
