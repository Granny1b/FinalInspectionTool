import type { InspectionDeviation } from '@modig/shared';
import { createContext } from 'react';

/**
 * The check's extra findings for the checklist: each section shows its own at its end, with a
 * button to add one. Through a context, so the memoised sections need no new props and are drawn
 * again only where a finding changed.
 */
export type SectionFindingsValue = {
  /** By section id; the general ones (no section) under GENERAL_FINDINGS. */
  bySection: ReadonlyMap<string, readonly InspectionDeviation[]>;
  /** Adds a finding to the section and opens it; absent on a finalised check. */
  onAdd?: ((sectionId: string) => void) | undefined;
  /** Opens a finding: to edit it, or on a finalised check to read it among the deviations. */
  onOpen: (key: string) => void;
};

/** The key of the findings that belong to no section. */
export const GENERAL_FINDINGS = '';

export const SectionFindingsContext = createContext<SectionFindingsValue | null>(null);

export function groupFindings(
  deviations: readonly InspectionDeviation[],
): Map<string, InspectionDeviation[]> {
  const bySection = new Map<string, InspectionDeviation[]>();
  for (const deviation of deviations) {
    if (deviation.kind !== 'extra') continue;
    const key = deviation.sectionId ?? GENERAL_FINDINGS;
    bySection.set(key, [...(bySection.get(key) ?? []), deviation]);
  }
  return bySection;
}
