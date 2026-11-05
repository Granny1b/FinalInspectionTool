import type { TemplateSummary } from '@modig/shared';

/**
 * A machine's quality checks by position, for its card and list row: "QC1, QC4 (draft)", with
 * "(draft)" for one never published. '' without any.
 */
export function qualityCheckPositions(checks: readonly TemplateSummary[]): string {
  return checks
    .map((check) => {
      const position = check.quality?.position.trim() || check.name.trim() || 'Untitled';
      return check.publishedRevision === null ? `${position} (draft)` : position;
    })
    .join(', ');
}

/** The quality checks of every machine, by the id of its final inspection template. */
export function qualityChecksByMachine(
  list: readonly TemplateSummary[],
): Map<string, TemplateSummary[]> {
  const byMachine = new Map<string, TemplateSummary[]>();
  for (const check of list) {
    if (check.kind !== 'quality' || !check.parentId) continue;
    byMachine.set(check.parentId, [...(byMachine.get(check.parentId) ?? []), check]);
  }
  return byMachine;
}
