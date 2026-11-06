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
  InspectionKindSchema,
  InspectionStateSchema,
  ModelCodeSchema,
  RowResultSchema,
  type AnnotatedImage,
  type Inspection,
  type InspectionKind,
  type Severity,
  type Template,
} from './schemas';

const IsoDateTime = z.iso.datetime({ offset: true });

/** What people call one of each kind: "Finalise the inspection", "Delete this quality check". */
export const INSPECTION_NOUNS: Record<InspectionKind, string> = {
  final: 'inspection',
  quality: 'quality check',
};

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
 * POST /api/inspections from a quality check: a check along the build has a shorter front page
 * (no machine name, location or photo). The machine is the quality check's model; the serial
 * number says which one it is. The template's kind decides which of the two requests applies.
 */
export const StartQualityCheckRequestSchema = z.object({
  templateId: IdSchema,
  front: z.object({
    serialNumber: z.string().trim().min(1, 'Serial number is required').max(100),
    /** Who did the check ("Checked by"), as participants are on a final inspection. */
    participants: InspectionFrontSchema.shape.participants,
    date: InspectionFrontSchema.shape.date,
  }),
});
export type StartQualityCheckRequest = z.infer<typeof StartQualityCheckRequestSchema>;

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
  /** Summaries stored before quality checks could be done have none: final inspections. */
  kind: InspectionKindSchema.default('final'),
  number: z.string(),
  machineName: z.string(),
  serialNumber: z.string(),
  modelCode: ModelCodeSchema,
  /** "YYYY-MM-DD" from the front page. */
  date: z.string(),
  state: InspectionStateSchema,
  /** Rows marked NOK (the list's #NOK column). */
  nokCount: z.number().int().min(0),
  /** Rows marked OK (with nokCount and filled, the first-pass rate in Insights). */
  okCount: z.number().int().min(0),
  filled: z.number().int().min(0),
  total: z.number().int().min(0),
  /** The template and published revision it was made from (which rows its checklist has). */
  templateId: IdSchema,
  templateRevision: z.number().int().min(1),
  /**
   * The checklist's name as frozen in it: a quality check's title, "Quality check – Pre start
   * up". '' in summaries stored before it was kept (final inspections, which never show it).
   */
  templateName: z.string().default(''),
  updatedAt: IsoDateTime,
});
export type InspectionSummary = z.infer<typeof InspectionSummarySchema>;
export const InspectionListSchema = z.array(InspectionSummarySchema);

/** Each kind's own number series: FI- for final inspections, QC- for quality checks. */
export const INSPECTION_NUMBER_PREFIXES: Record<InspectionKind, string> = {
  final: 'FI',
  quality: 'QC',
};

/**
 * "FI-2026-0042" (brief §4), or "QC-2026-0007" for a quality check. Each series restarts every
 * year.
 */
export function formatInspectionNumber(
  year: number,
  sequence: number,
  kind: InspectionKind = 'final',
): string {
  return `${INSPECTION_NUMBER_PREFIXES[kind]}-${year}-${String(sequence).padStart(4, '0')}`;
}

/** "QC-2026-0007" → its kind, year and sequence; null for anything else. */
export function parseInspectionNumber(
  number: string,
): { kind: InspectionKind; year: number; sequence: number } | null {
  const match = /^(FI|QC)-(\d{4})-(\d+)$/.exec(number);
  if (!match) return null;
  return {
    kind: match[1] === 'QC' ? 'quality' : 'final',
    year: Number(match[2]),
    sequence: Number(match[3]),
  };
}

/**
 * The frozen copy an inspection keeps of its template revision: the name and checklist, and a
 * quality check's front page. A deep copy, so later edits to the template — or to this object —
 * never leak between the two.
 */
export function snapshotTemplate(revision: Template): Inspection['templateSnapshot'] {
  const snapshot: Inspection['templateSnapshot'] = {
    name: revision.name,
    sections: revision.sections,
    ...(revision.kind === 'quality' && revision.quality && { quality: revision.quality }),
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
  /** One of the settings' deviation categories, or '' when none was chosen. */
  category: string;
  /** Annotated evidence photos (rendered copies are what print shows). */
  photos: AnnotatedImage[];
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
        category: result.category ?? '',
        photos: result.photos ?? [],
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
    category: extra.category ?? '',
    photos: extra.photos ?? [],
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
  /** Rows marked OK. */
  ok: number;
  /** Rows marked NOK. */
  nok: number;
};

/** For "87 / 104 rows filled · 6 NOK" (brief §5.3). */
export function inspectionProgress(
  inspection: Pick<Inspection, 'templateSnapshot' | 'results'>,
): InspectionProgress {
  let total = 0;
  let filled = 0;
  let ok = 0;
  let nok = 0;
  for (const section of inspection.templateSnapshot.sections) {
    for (const item of section.items) {
      total += 1;
      const status = inspection.results[item.id]?.status;
      if (status) filled += 1;
      if (status === 'OK') ok += 1;
      if (status === 'NOK') nok += 1;
    }
  }
  return { total, filled, ok, nok };
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
 * also needs to say which machine it is about, and every extra deviation needs a description. A
 * quality check has no machine name (its machine is the model): it needs the serial number only.
 */
export function validateForFinalise(
  inspection: Pick<Inspection, 'front' | 'templateSnapshot' | 'results' | 'extraDeviations'> & {
    kind?: InspectionKind;
  },
): FinaliseIssue[] {
  const issues: FinaliseIssue[] = [];
  if (inspection.kind !== 'quality' && !inspection.front.machineName.trim()) {
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
