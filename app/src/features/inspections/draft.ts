import type { Inspection, InspectionDraftInput } from '@modig/shared';

/**
 * The parts of an inspection the page edits and autosaves (the PUT body, brief §8). Number,
 * snapshot, model, state and audit fields belong to the server.
 */
export function draftOf(inspection: Inspection): InspectionDraftInput {
  const { modelCode: _model, ...front } = inspection.front;
  return { front, results: inspection.results, extraDeviations: inspection.extraDeviations };
}

/**
 * True when two drafts have the same content. Key order is ignored: the server's copy comes back
 * in schema order, the page's in the order the user filled things in.
 */
export function sameDraft(a: InspectionDraftInput, b: InspectionDraftInput): boolean {
  return canonical(a) === canonical(b);
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, nested: unknown) =>
    nested && typeof nested === 'object' && !Array.isArray(nested)
      ? Object.fromEntries(Object.entries(nested).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : nested,
  );
}
