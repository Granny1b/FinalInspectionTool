import type { InspectionDraftInput } from '@modig/shared';

const COLLATOR = new Intl.Collator('sv', { sensitivity: 'base', numeric: true });

/**
 * Autocomplete values for the Resp fields (brief §4: "free text with autocomplete from history"):
 * the names used in earlier deviations plus the ones typed in this inspection, which the history
 * doesn't know yet. Trimmed; names that differ only in case count once, in the history's spelling
 * (the one most deviations use); sorted Swedish-style.
 */
export function respSuggestions(
  history: readonly string[] | undefined,
  draft: Pick<InspectionDraftInput, 'results' | 'extraDeviations'>,
): string[] {
  const own = [
    ...Object.values(draft.results).map((result) => result.resp),
    ...draft.extraDeviations.map((extra) => extra.resp),
  ];
  const byKey = new Map<string, string>();
  for (const value of [...(history ?? []), ...own]) {
    const name = value?.trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase('sv');
    if (!byKey.has(key)) byKey.set(key, name);
  }
  return [...byKey.values()].sort(COLLATOR.compare);
}
