/**
 * The data model (brief §4) as zod schemas. Types are inferred from the schemas so the
 * frontend, the API and the seed script validate against exactly the same shapes.
 *
 * Schemas are deliberately permissive about *content* (empty strings are allowed in drafts)
 * and strict about *structure*. Stricter rules (e.g. "every row needs text before publishing")
 * belong to the specific action that needs them.
 */
import { z } from 'zod';
import { ID_PATTERN } from './ids';
import { ROLES } from './roles';

export const IdSchema = z.string().regex(ID_PATTERN, 'Invalid id');
const IsoDateTime = z.iso.datetime({ offset: true });
/** Calendar date, "YYYY-MM-DD". */
const IsoDate = z.iso.date();

// ---------------------------------------------------------------------------------------------
// Machine models & settings
// ---------------------------------------------------------------------------------------------

export const MachineModelSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[A-Za-z0-9]+$/, 'Model code must be letters and digits'),
  name: z.string().trim().min(1).max(100),
});
export type MachineModel = z.infer<typeof MachineModelSchema>;

/** `config/settings.json` — admin-managed app settings (brief §5.6). */
export const SettingsSchema = z.object({
  machineModels: z.array(MachineModelSchema),
  defaultLocation: z.string().max(200),
  companyName: z.string().max(200),
  logoImageId: IdSchema.optional(),
  updatedAt: IsoDateTime,
  updatedBy: z.string(),
});
export type Settings = z.infer<typeof SettingsSchema>;

// ---------------------------------------------------------------------------------------------
// Guides & annotations (brief §5.4)
// ---------------------------------------------------------------------------------------------

/** Coordinates are fractions (0–1) of image width/height so they survive resizing. */
const Fraction = z.number();
const Color = z.string().min(1).max(32);

const ArrowAnnotationSchema = z.object({
  kind: z.literal('arrow'),
  points: z.array(Fraction),
  color: Color,
});
const BoxShape = { x: Fraction, y: Fraction, w: Fraction, h: Fraction, color: Color };
const RectAnnotationSchema = z.object({ kind: z.literal('rect'), ...BoxShape });
const EllipseAnnotationSchema = z.object({ kind: z.literal('ellipse'), ...BoxShape });
const TextAnnotationSchema = z.object({
  kind: z.literal('text'),
  x: Fraction,
  y: Fraction,
  text: z.string().max(500),
  color: Color,
  size: z.number().positive(),
});
const FreehandAnnotationSchema = z.object({
  kind: z.literal('freehand'),
  points: z.array(Fraction),
  color: Color,
});

export const AnnotationSchema = z.discriminatedUnion('kind', [
  ArrowAnnotationSchema,
  RectAnnotationSchema,
  EllipseAnnotationSchema,
  TextAnnotationSchema,
  FreehandAnnotationSchema,
]);
export type Annotation = z.infer<typeof AnnotationSchema>;

export const GuideImageSchema = z.object({
  imageId: IdSchema,
  verdict: z.enum(['good', 'bad', 'info']),
  caption: z.string().max(500).optional(),
  annotations: z.array(AnnotationSchema),
  renderedImageId: IdSchema.optional(),
});
export type GuideImage = z.infer<typeof GuideImageSchema>;

export const GuideSchema = z.object({
  description: z.string().max(5000).optional(),
  images: z.array(GuideImageSchema),
});
export type Guide = z.infer<typeof GuideSchema>;

// ---------------------------------------------------------------------------------------------
// Templates (brief §4, §5.2)
// ---------------------------------------------------------------------------------------------

export const ItemSchema = z.object({
  /** STABLE forever – survives renumbering, rewording and new revisions. KPIs group by it. */
  id: IdSchema,
  /** "Lifting columns - Marked screws, blue/red/yellow". May be empty while a draft is edited. */
  text: z.string().max(1000),
  guide: GuideSchema.optional(),
});
export type Item = z.infer<typeof ItemSchema>;

/** Order of sections and items = array order. Display numbers are derived (see numbering.ts). */
export const SectionSchema = z.object({
  id: IdSchema,
  title: z.string().max(200),
  items: z.array(ItemSchema),
});
export type Section = z.infer<typeof SectionSchema>;

export const DEFAULT_SPARE_ROWS_PER_SECTION = 3;

export const PrintSettingsSchema = z.object({
  spareRowsPerSection: z.number().int().min(0).max(30),
});
export type PrintSettings = z.infer<typeof PrintSettingsSchema>;

export const TemplateStatusSchema = z.enum(['draft', 'published']);
export type TemplateStatus = z.infer<typeof TemplateStatusSchema>;

export const TemplateSchema = z.object({
  id: IdSchema,
  /** "Final inspection – RigiMill MG" */
  name: z.string().max(200),
  modelCode: z.string().min(1).max(32),
  /** Published revision number; a draft carries last published + 1. */
  revision: z.number().int().min(1),
  status: TemplateStatusSchema,
  coverImageId: IdSchema.optional(),
  printSettings: PrintSettingsSchema,
  sections: z.array(SectionSchema),
  /** Optional note written when a revision is published (shown in revision history). */
  changeNote: z.string().max(1000).optional(),
  updatedAt: IsoDateTime,
  updatedBy: z.string(),
});
export type Template = z.infer<typeof TemplateSchema>;

// ---------------------------------------------------------------------------------------------
// Inspections (brief §4, §5.3)
// ---------------------------------------------------------------------------------------------

export const STATUSES = ['OK', 'NOK', 'NA'] as const;
export const StatusSchema = z.enum(STATUSES);
export type Status = z.infer<typeof StatusSchema>;
/** How a status is shown to people (the stored value for N/A is "NA"). */
export const STATUS_LABELS: Record<Status, string> = { OK: 'OK', NOK: 'NOK', NA: 'N/A' };

export const SEVERITIES = ['minor', 'major', 'critical'] as const;
export const SeveritySchema = z.enum(SEVERITIES);
export type Severity = z.infer<typeof SeveritySchema>;
export const DEFAULT_SEVERITY: Severity = 'minor';

export const RowResultSchema = z.object({
  status: StatusSchema.optional(),
  comment: z.string().max(2000).optional(),
  /** Responsible person/department (free text with autocomplete from history). */
  resp: z.string().max(200).optional(),
  /** Only meaningful when status is NOK; defaults to "minor". */
  severity: SeveritySchema.optional(),
  photoIds: z.array(IdSchema).optional(),
});
export type RowResult = z.infer<typeof RowResultSchema>;

/**
 * A deviation that is not tied to a checklist row (added from the Deviation Summary).
 * The brief references this type without defining it; this is the smallest shape that
 * fills the summary columns (D-nn | ref | checkpoint/description | comment | severity | resp).
 */
export const ExtraDeviationSchema = z.object({
  id: IdSchema,
  description: z.string().max(1000),
  comment: z.string().max(2000).optional(),
  resp: z.string().max(200).optional(),
  severity: SeveritySchema,
});
export type ExtraDeviation = z.infer<typeof ExtraDeviationSchema>;

export const InspectionFrontSchema = z.object({
  machineName: z.string().max(200),
  modelCode: z.string().max(32),
  serialNumber: z.string().max(100),
  participants: z.array(z.string().max(200)),
  location: z.string().max(200),
  /** "YYYY-MM-DD" */
  date: IsoDate,
  photoId: IdSchema.optional(),
});
export type InspectionFront = z.infer<typeof InspectionFrontSchema>;

export const InspectionStateSchema = z.enum(['in_progress', 'finalised']);
export type InspectionState = z.infer<typeof InspectionStateSchema>;

/** "FI-2026-0042" */
export const INSPECTION_NUMBER_PATTERN = /^FI-\d{4}-\d{4,}$/;

export const InspectionSchema = z.object({
  id: IdSchema,
  number: z.string().regex(INSPECTION_NUMBER_PATTERN),
  templateId: IdSchema,
  templateRevision: z.number().int().min(1),
  /** FROZEN copy at creation – template edits never change existing inspections. */
  templateSnapshot: z.object({ sections: z.array(SectionSchema) }),
  front: InspectionFrontSchema,
  /** Keyed by Item.id */
  results: z.record(IdSchema, RowResultSchema),
  extraDeviations: z.array(ExtraDeviationSchema),
  state: InspectionStateSchema,
  finalisedAt: IsoDateTime.optional(),
  finalisedBy: z.string().optional(),
});
export type Inspection = z.infer<typeof InspectionSchema>;

/** `config/inspection-counter.json` — next number per year. */
export const InspectionCounterSchema = z.object({
  year: z.number().int(),
  last: z.number().int().min(0),
});
export type InspectionCounter = z.infer<typeof InspectionCounterSchema>;

// ---------------------------------------------------------------------------------------------
// Deviation table row (Azure Table Storage, KPI source — brief §4)
// ---------------------------------------------------------------------------------------------

/**
 * One row per deviation, denormalised so KPI queries need no joins.
 * PartitionKey = modelCode, RowKey = `{inspectionId}_{itemId or extraId}` (see storage.ts).
 * For extra deviations `itemId` is empty and `displayRef` is "—".
 */
export const DeviationRowSchema = z.object({
  inspectionId: IdSchema,
  inspectionNumber: z.string(),
  serialNumber: z.string(),
  machineName: z.string(),
  modelCode: z.string(),
  templateId: IdSchema,
  templateRevision: z.number().int(),
  itemId: z.string(),
  sectionTitle: z.string(),
  displayRef: z.string(),
  checkpointText: z.string(),
  comment: z.string(),
  resp: z.string(),
  severity: SeveritySchema,
  /** "YYYY-MM-DD" */
  inspectionDate: z.string(),
  finalised: z.boolean(),
  createdAt: IsoDateTime,
});
export type DeviationRow = z.infer<typeof DeviationRowSchema>;

// ---------------------------------------------------------------------------------------------
// Current user (GET /api/me)
// ---------------------------------------------------------------------------------------------

export const MeSchema = z.object({
  name: z.string(),
  email: z.string(),
  roles: z.array(z.enum(ROLES)),
});
export type Me = z.infer<typeof MeSchema>;

// ---------------------------------------------------------------------------------------------
// API errors
// ---------------------------------------------------------------------------------------------

export const API_ERROR_CODES = [
  'bad_request',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'precondition_failed',
  'internal',
] as const;
export const ApiErrorSchema = z.object({
  error: z.enum(API_ERROR_CODES),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/** User-facing text for an ETag mismatch (HTTP 412) — brief §3. */
export const CONFLICT_MESSAGE = 'Someone else changed this – reload to see the latest version.';
