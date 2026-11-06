import { compareQualityChecks, type TemplateSummary } from '@modig/shared';

/**
 * A machine's quality checks by name, for its card and list row: "Pre start up, Frame (draft)",
 * with "(draft)" for one never published. '' without any.
 */
export function qualityCheckNames(checks: readonly TemplateSummary[]): string {
  return checks
    .map((check) => {
      const name = check.quality?.name.trim() || check.name.trim() || 'Untitled';
      return check.publishedRevision === null ? `${name} (draft)` : name;
    })
    .join(', ');
}

/**
 * The quality checks of every machine, by the id of its final inspection template, in the order
 * they are done.
 */
export function qualityChecksByMachine(
  list: readonly TemplateSummary[],
): Map<string, TemplateSummary[]> {
  const byMachine = new Map<string, TemplateSummary[]>();
  for (const check of list) {
    if (check.kind !== 'quality' || !check.parentId) continue;
    byMachine.set(check.parentId, [...(byMachine.get(check.parentId) ?? []), check]);
  }
  for (const checks of byMachine.values()) checks.sort(compareQualityChecks);
  return byMachine;
}
