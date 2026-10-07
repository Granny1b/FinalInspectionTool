/**
 * Inspection contract (brief §4, §5.1, §5.3, §8): request/response shapes for the inspection
 * endpoints and the pure rules both sides share — deviation derivation (D-01, D-02…), progress,
 * what must hold before finalising, and the frozen template snapshot.
 */
import { z } from 'zod';
import { deviationNumber, indexItems } from './numbering';
import {
  DEFAULT_SEVERITY,
  ExtraDeviationSchema,
  IdSchema,
  InspectionFrontSchema,
  InspectionStateSchema,
  ModelCodeSchema,
  RowResultSchema,
  type Inspection,
  type Severity,
  type Template,
} from './schemas';

const IsoDateTime = z.iso.datetime({ offset: true });

/** Front-page fields people fill in. The model comes from the template and never changes. */
export const InspectionFrontInputSchema = InspectionFrontSchema.omit({ modelCode: true });
export type InspectionFrontInput = z.infer<typeof InspectionFrontInputSchema>;

/** POST /api/inspections — start from the template's latest published revision. */
export const CreateInspectionRequestSchema = z.object({
  templateId: IdSchema,
  front: InspectionFrontInputSchema.extend({
    machineName: z.string().trim().min(1, 'Machine name is required').max(200),
    serialNumber: z.string().trim().min(1, 'Serial number is required').max(100),
  }),
});
export type CreateInspectionRequest = z.infer<typeof CreateInspectionRequestSchema>;

/**
 * PUT /api/inspections/{id} — the only fields a client may change. Number, template snapshot,
 * state and audit fields are owned by the server.
 */
export const InspectionDraftInputSchema = z.object({
  front: InspectionFrontInputSchema,
  results: z.record(IdSchema, RowResultSchema),
  extraDeviations: z.array(ExtraDeviationSchema),
});
export type InspectionDraftInput = z.infer<typeof InspectionDraftInputSchema>;

/** GET /api/inspections — one entry per inspection (brief §5.1 table). */
export const InspectionSummarySchema = z.object({
  id: IdSchema,
  number: z.string(),
  machineName: z.string(),
  serialNumber: z.string(),
  modelCode: ModelCodeSchema,
  /** "YYYY-MM-DD" from the front page. */
  date: z.string(),
  state: InspectionStateSchema,
  /** Rows marked NOK (the list's #NOK column). */
  nokCount: z.number().int().min(0),
  filled: z.number().int().min(0),
  total: z.number().int().min(0),
  updatedAt: IsoDateTime,
});
export type InspectionSummary = z.infer<typeof InspectionSummarySchema>;
export const InspectionListSchema = z.array(InspectionSummarySchema);

/** GET /api/resp-suggestions — distinct "Resp" values used before, for autocomplete. */
export const RespSuggestionsSchema = z.array(z.string());

/** "FI-2026-0042" (brief §4). The sequence restarts every year. */
export function formatInspectionNumber(year: number, sequence: number): string {
  return `FI-${year}-${String(sequence).padStart(4, '0')}`;
}

/**
 * The frozen copy an inspection keeps of its template revision. A deep copy, so later edits to
 * the template — or to this object — never leak between the two.
 */
export function snapshotTemplate(revision: Template): Inspection['templateSnapshot'] {
  const snapshot: Inspection['templateSnapshot'] = {
    name: revision.name,
    sections: revision.sections,
    printSettings: revision.printSettings,
  };
  // Plain JSON data, so a JSON round trip is a complete deep copy.
  return JSON.parse(JSON.stringify(snapshot)) as Inspection['templateSnapshot'];
}

// ---------------------------------------------------------------------------------------------
// Deviations
// ---------------------------------------------------------------------------------------------

/** Ref shown for deviations that are not tied to a checklist row. */
export const EXTRA_DEVIATION_REF = '—';

export type InspectionDeviation = {
  /** "D-01", in order of appearance: NOK rows in checklist order, then extra deviations. */
  number: string;
  kind: 'row' | 'extra';
  /** Item.id for row deviations, ExtraDeviation.id for extra ones (stable; Table RowKey suffix). */
  key: string;
  /** Item.id for row deviations, null for extra ones. */
  itemId: string | null;
  sectionTitle: string;
  /** "3.c", or EXTRA_DEVIATION_REF for extra deviations. */
  ref: string;
  /** Checkpoint text, or the extra deviation's description. */
  text: string;
  comment: string;
  severity: Severity;
  resp: string;
};

type DeviationSource = Pick<Inspection, 'templateSnapshot' | 'results' | 'extraDeviations'>;

/** Every NOK row plus every extra deviation, numbered D-01, D-02… (brief §4, §5.3). */
export function deriveDeviations(inspection: DeviationSource): InspectionDeviation[] {
  const rows = indexItems(inspection.templateSnapshot.sections).flatMap((item) => {
    const result = inspection.results[item.itemId];
    if (result?.status !== 'NOK') return [];
    return [
      {
        kind: 'row' as const,
        key: item.itemId,
        itemId: item.itemId,
        sectionTitle: item.sectionTitle,
        ref: item.ref,
        text: item.text,
        comment: result.comment ?? '',
        severity: result.severity ?? DEFAULT_SEVERITY,
        resp: result.resp ?? '',
      },
    ];
  });
  const extras = inspection.extraDeviations.map((extra) => ({
    kind: 'extra' as const,
    key: extra.id,
    itemId: null,
    sectionTitle: '',
    ref: EXTRA_DEVIATION_REF,
    text: extra.description,
    comment: extra.comment ?? '',
    severity: extra.severity,
    resp: extra.resp ?? '',
  }));
  return [...rows, ...extras].map((deviation, index) => ({
    number: deviationNumber(index),
    ...deviation,
  }));
}

export type InspectionProgress = {
  /** Checklist rows in the snapshot. */
  total: number;
  /** Rows that have a status. */
  filled: number;
  /** Rows marked NOK. */
  nok: number;
};

/** For "87 / 104 rows filled · 6 NOK" (brief §5.3). */
export function inspectionProgress(
  inspection: Pick<Inspection, 'templateSnapshot' | 'results'>,
): InspectionProgress {
  let total = 0;
  let filled = 0;
  let nok = 0;
  for (const section of inspection.templateSnapshot.sections) {
    for (const item of section.items) {
      total += 1;
      const status = inspection.results[item.id]?.status;
      if (status) filled += 1;
      if (status === 'NOK') nok += 1;
    }
  }
  return { total, filled, nok };
}

// ---------------------------------------------------------------------------------------------
// Finalise rules
// ---------------------------------------------------------------------------------------------

/** One problem; a 400 from …/finalise carries the list in `details`. */
export const FinaliseIssueSchema = z.object({
  /** Where the problem is, so the page can link to it. */
  target: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('front'), field: z.enum(['machineName', 'serialNumber']) }),
    z.object({ kind: z.literal('row'), sectionId: z.string(), itemId: z.string() }),
    z.object({ kind: z.literal('extra'), extraId: z.string() }),
  ]),
  message: z.string(),
});
export type FinaliseIssue = z.infer<typeof FinaliseIssueSchema>;

/**
 * What must hold before an inspection is locked (brief §5.3: every row has a status). A report
 * also needs to say which machine it is about, and every extra deviation needs a description.
 */
export function validateForFinalise(
  inspection: Pick<Inspection, 'front' | 'templateSnapshot' | 'results' | 'extraDeviations'>,
): FinaliseIssue[] {
  const issues: FinaliseIssue[] = [];
  if (!inspection.front.machineName.trim()) {
    issues.push({
      target: { kind: 'front', field: 'machineName' },
      message: 'The front page needs a machine name.',
    });
  }
  if (!inspection.front.serialNumber.trim()) {
    issues.push({
      target: { kind: 'front', field: 'serialNumber' },
      message: 'The front page needs a serial number.',
    });
  }
  for (const item of indexItems(inspection.templateSnapshot.sections)) {
    if (!inspection.results[item.itemId]?.status) {
      issues.push({
        target: { kind: 'row', sectionId: item.sectionId, itemId: item.itemId },
        message: `Row ${item.ref} has no status.`,
      });
    }
  }
  for (const deviation of deriveDeviations(inspection)) {
    if (deviation.kind === 'extra' && !deviation.text.trim()) {
      issues.push({
        target: { kind: 'extra', extraId: deviation.key },
        message: `Deviation ${deviation.number} needs a description.`,
      });
    }
  }
  return issues;
}
