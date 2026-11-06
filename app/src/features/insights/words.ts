/**
 * How Insights talks about what it counts: final inspections, or quality checks done on
 * machines. The numbers are worked out the same way for both; only the words differ, on the page
 * and on paper alike.
 */
import type { InspectionKind } from '@modig/shared';

export type InsightsWords = {
  kind: InspectionKind;
  /** In a sentence: "inspection", "quality check". */
  one: string;
  many: string;
  /** Where room is short (a column, a tile): "Inspections", "Checks". */
  shortMany: string;
  /** "inspection", "check": a column's or a tooltip's count. */
  shortOne: string;
  /** The KPI tile of the deviations per inspection: "Deviations per machine", "… per check". */
  perOneLabel: string;
  /** Its column in the report's Per model table. */
  perOneColumn: string;
  /** What the count tile counts when only finalised ones count. */
  doneInPeriod: string;
  /** The printed report's title. */
  reportTitle: string;
  /** The CSV export's file name, before its filters (the API names it the same way). */
  csvTitle: string;
};

export const INSIGHTS_WORDS: Record<InspectionKind, InsightsWords> = {
  final: {
    kind: 'final',
    one: 'inspection',
    many: 'inspections',
    shortMany: 'Inspections',
    shortOne: 'inspection',
    perOneLabel: 'Deviations per machine',
    perOneColumn: 'Per machine',
    doneInPeriod: 'Machines inspected in the period',
    reportTitle: 'Deviation report',
    csvTitle: 'Deviations',
  },
  quality: {
    kind: 'quality',
    one: 'quality check',
    many: 'quality checks',
    shortMany: 'Checks',
    shortOne: 'check',
    perOneLabel: 'Deviations per check',
    perOneColumn: 'Per check',
    doneInPeriod: 'Quality checks done in the period',
    reportTitle: 'Quality check deviation report',
    csvTitle: 'Quality check deviations',
  },
};

/** "Inspections", "Quality checks": the start of a sentence or a label. */
export function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
