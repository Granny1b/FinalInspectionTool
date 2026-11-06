/**
 * The data model (brief §4) as zod schemas. Types are inferred from the schemas so the
 * frontend, the API and the seed script validate against exactly the same shapes.
 *
 * Schemas are deliberately permissive about *content* (empty strings are allowed in drafts)
 * and strict about *structure*. Stricter rules (e.g. "every row needs text before publishing")
 * belong to the specific action that needs them.
 *
 * Objects strip keys they don't know (zod's default; never `.strict()`), so data stored by an
 * earlier version still parses after a field is removed: templates, inspections and template
 * files from before spare lines were removed carry `printSettings` and `Section.spareRows`, and
 * parse without them.
 */
import { z } from 'zod';
import { DEFAULT_DEVIATION_CATEGORIES, DEFAULT_RESPONSIBLES } from './constants';
import { ID_PATTERN } from './ids';
import { ROLES } from './roles';

export const IdSchema = z.string().regex(ID_PATTERN, 'Invalid id');
const IsoDateTime = z.iso.datetime({ offset: true });
/** Calendar date, "YYYY-MM-DD". */
const IsoDate = z.iso.date();

// ---------------------------------------------------------------------------------------------
// Machine models & settings
// ---------------------------------------------------------------------------------------------

/** Letters and digits only: see ModelCodeSchema. */
export const MODEL_CODE_PATTERN = /^[A-Za-z0-9]+$/;

/**
 * Machine model short code ("RMMG"). It is the deviations table's PartitionKey, which rejects
 * `/`, `\`, `#`, `?` and control characters: letters and digits only, wherever it appears.
 */
export const ModelCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(MODEL_CODE_PATTERN, 'Model code must be letters and digits');

export const MachineModelSchema = z.object({
  code: ModelCodeSchema,
  name: z.string().trim().min(1).max(100),
});
export type MachineModel = z.infer<typeof MachineModelSchema>;

/** One entry of an admin-managed pick list (Responsible, deviation category). */
export const ListEntrySchema = z.string().trim().min(1).max(100);

/** `config/settings.json` — admin-managed app settings (brief §5.6). */
export const SettingsSchema = z.object({
  machineModels: z.array(MachineModelSchema),
  defaultLocation: z.string().max(200),
  companyName: z.string().max(200),
  logoImageId: IdSchema.optional(),
  /**
   * The "Resp" choices on a deviation (responsible department), in the order shown. Settings
   * written before the list existed get the defaults.
   */
  responsibles: z.array(ListEntrySchema).default(() => [...DEFAULT_RESPONSIBLES]),
  /** The category choices on a deviation, in the order shown; defaults as for `responsibles`. */
  deviationCategories: z.array(ListEntrySchema).default(() => [...DEFAULT_DEVIATION_CATEGORIES]),
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

/** The annotation colours: brief §5.4's red, Modig cyan, yellow and white, plus green. */
export const ANNOTATION_COLORS = {
  red: '#E02424',
  green: '#22C55E',
  cyan: '#29ABE2',
  yellow: '#FACC15',
  white: '#FFFFFF',
} as const;

/**
 * A photo with vector annotations drawn on it (arrows, boxes, text…). The vectors stay editable;
 * `renderedImageId` is a flattened copy (photo + annotations) used for thumbnails and print.
 * Used for deviation photos and, from phase 5, guide images.
 */
export const AnnotatedImageSchema = z.object({
  imageId: IdSchema,
  caption: z.string().max(500).optional(),
  annotations: z.array(AnnotationSchema),
  renderedImageId: IdSchema.optional(),
});
export type AnnotatedImage = z.infer<typeof AnnotatedImageSchema>;

/** Verdict badge on a guide image (brief §5.4: Good ✓ / Bad ✗ / Info). */
export const GUIDE_VERDICTS = ['good', 'bad', 'info'] as const;
export type GuideVerdict = (typeof GUIDE_VERDICTS)[number];
export const GUIDE_VERDICT_LABELS: Record<GuideVerdict, string> = {
  good: 'Good',
  bad: 'Bad',
  info: 'Info',
};
/**
 * The same verdicts as quality checks word them: a picture shows how the checkpoint should, or
 * should not, look. The stored values stay `good`, `bad` and `info`.
 */
export const QUALITY_VERDICT_LABELS: Record<GuideVerdict, string> = {
  good: 'Should look like this',
  bad: 'Should not look like this',
  info: 'Info',
};
/** Enough for good/bad pairs from a few angles; small enough for the print appendix. */
export const MAX_GUIDE_IMAGES = 6;

export const GuideImageSchema = AnnotatedImageSchema.extend({
  verdict: z.enum(GUIDE_VERDICTS),
});
export type GuideImage = z.infer<typeof GuideImageSchema>;

export const GuideSchema = z.object({
  description: z.string().max(5000).optional(),
  images: z.array(GuideImageSchema).max(MAX_GUIDE_IMAGES),
});
export type Guide = z.infer<typeof GuideSchema>;

// ---------------------------------------------------------------------------------------------
// Templates (brief §4, §5.2)
// ---------------------------------------------------------------------------------------------

/** One reference of a quality check's row, such as "ISO 12100". */
export const ReferenceSchema = z.string().trim().min(1).max(100);
/** At most this many references on a row. */
export const MAX_REFERENCES = 20;
/** The most hours a row's time may say. */
export const MAX_ROW_HOURS = 999;

export const ItemSchema = z.object({
  /** STABLE forever – survives renumbering, rewording and new revisions. KPIs group by it. */
  id: IdSchema,
  /**
   * "Lifting columns - Marked screws, blue/red/yellow". May be empty while a draft is edited. A
   * quality check's row calls it "What".
   */
  text: z.string().max(1000),
  /**
   * Pictures and more information. A quality check's row shows its images as how the checkpoint
   * should (good) or should not (bad) look, and its description as "More information".
   */
  guide: GuideSchema.optional(),
  /** Quality checks only: how to check it. Final inspection templates leave it out. */
  how: z.string().max(2000).optional(),
  /** Quality checks only: standards and documents, e.g. "ISO 12100". */
  references: z.array(ReferenceSchema).max(MAX_REFERENCES).optional(),
  /** Quality checks only: the time the check takes, in hours (one decimal). */
  timeHours: z.number().min(0).max(MAX_ROW_HOURS).optional(),
});
export type Item = z.infer<typeof ItemSchema>;

/** Order of sections and items = array order. Display numbers are derived (see numbering.ts). */
export const SectionSchema = z.object({
  id: IdSchema,
  title: z.string().max(200),
  items: z.array(ItemSchema),
});
export type Section = z.infer<typeof SectionSchema>;

export const TemplateStatusSchema = z.enum(['draft', 'published']);
export type TemplateStatus = z.infer<typeof TemplateStatusSchema>;

/**
 * What a template is: a machine model's final inspection checklist, or one of its quality checks
 * (in-process checks along the build, such as "Quality check – Pre start up").
 */
export const TEMPLATE_KINDS = ['final', 'quality'] as const;
export const TemplateKindSchema = z.enum(TEMPLATE_KINDS);
export type TemplateKind = z.infer<typeof TemplateKindSchema>;

/** A quality check's front page. Empty strings while it is being written. */
export const QualityFrontSchema = z.object({
  /** The in-process check, "Pre start up": the quality check is called after it. Required to publish. */
  name: z.string().max(200),
  /** The department that owns the check, e.g. "Quality" (from the Responsible list). */
  department: z.string().max(200),
  /** "1.22.2" */
  documentNumber: z.string().max(100),
  /** Who wrote the check (a name as typed). */
  madeBy: z.string().max(200),
  /** "YYYY-MM-DD", or '' when not set. */
  date: z.union([IsoDate, z.literal('')]),
});
export type QualityFront = z.infer<typeof QualityFrontSchema>;

export const TemplateSchema = z.object({
  id: IdSchema,
  /** Templates stored before quality checks existed have no kind: they are final inspections. */
  kind: TemplateKindSchema.default('final'),
  /** A quality check's machine: the id of its model's final inspection template. */
  parentId: IdSchema.optional(),
  /**
   * "Final inspection – RigiMill MG". A quality check's is "Quality check – {its front page's
   * name}", kept in step with the front page.
   */
  name: z.string().max(200),
  /** A quality check has its machine's code, copied when it is created. */
  modelCode: ModelCodeSchema,
  /** Published revision number; a draft carries last published + 1. */
  revision: z.number().int().min(1),
  status: TemplateStatusSchema,
  coverImageId: IdSchema.optional(),
  /** Quality checks only: the front page. */
  quality: QualityFrontSchema.optional(),
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
/**
 * Photos per deviation. Two keep every photo on the printed deviation card in both the
 * 2-per-page and 4-per-page layouts (typically an overview and a close-up).
 */
export const MAX_PHOTOS_PER_DEVIATION = 2;
/** How a severity is shown to people (inspection page, deviation summary, print). */
export const SEVERITY_LABELS: Record<Severity, string> = {
  minor: 'Minor',
  major: 'Major',
  critical: 'Critical',
};

export const RowResultSchema = z.object({
  status: StatusSchema.optional(),
  comment: z.string().max(2000).optional(),
  /**
   * Responsible department ("Resp."), picked from the settings' `responsibles`. Stored as text, so
   * a value removed from the list since (or typed before the list existed) is kept.
   */
  resp: z.string().max(200).optional(),
  /** Only meaningful when status is NOK; defaults to "minor". */
  severity: SeveritySchema.optional(),
  /** What kind of deviation (one of the settings' `deviationCategories`); only when NOK. */
  category: ListEntrySchema.optional(),
  /** Annotated evidence photos of a deviation (printed on the deviation pages). */
  photos: z.array(AnnotatedImageSchema).max(MAX_PHOTOS_PER_DEVIATION).optional(),
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
  /** As on a row result. */
  category: ListEntrySchema.optional(),
  photos: z.array(AnnotatedImageSchema).max(MAX_PHOTOS_PER_DEVIATION).optional(),
});
export type ExtraDeviation = z.infer<typeof ExtraDeviationSchema>;

export const InspectionFrontSchema = z.object({
  /**
   * The Machine ID, as the ERP (Monitor) knows the machine: "Magellan#1". Called the machine name
   * until quality checks got one too; the field kept its name, so nothing stored changes.
   */
  machineName: z.string().max(200),
  /** Known from the start: an inspection is always created from a template. */
  modelCode: ModelCodeSchema,
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

/**
 * What was done: a final inspection before delivery, or a quality check along the build. It is
 * the kind of the template it was made from. Inspections stored before quality checks could be
 * done have none: they are final inspections.
 */
export const InspectionKindSchema = TemplateKindSchema;
export type InspectionKind = TemplateKind;

/** "FI-2026-0042" for a final inspection, "QC-2026-0007" for a quality check. */
export const INSPECTION_NUMBER_PATTERN = /^(FI|QC)-\d{4}-\d{4,}$/;

export const InspectionSchema = z.object({
  id: IdSchema,
  /** Defaulted, so every inspection stored before quality checks could be done is final. */
  kind: InspectionKindSchema.default('final'),
  number: z.string().regex(INSPECTION_NUMBER_PATTERN),
  templateId: IdSchema,
  templateRevision: z.number().int().min(1),
  /**
   * FROZEN copy at creation – template edits never change existing inspections. Besides the
   * sections (a quality check's rows with their how, references, time and pictures) it keeps the
   * template's name and a quality check's front page, so showing or printing it never depends on
   * the live template, which may since have changed or been deleted.
   */
  templateSnapshot: z.object({
    name: z.string().max(200),
    sections: z.array(SectionSchema),
    /** Quality checks only: the quality check's front page (name, department, document no.). */
    quality: QualityFrontSchema.optional(),
  }),
  front: InspectionFrontSchema,
  /** Keyed by Item.id */
  results: z.record(IdSchema, RowResultSchema),
  extraDeviations: z.array(ExtraDeviationSchema),
  state: InspectionStateSchema,
  finalisedAt: IsoDateTime.optional(),
  finalisedBy: z.string().optional(),
  /** Server-owned audit fields (emails), shown in the list and used for the deviation rows. */
  createdAt: IsoDateTime,
  createdBy: z.string(),
  updatedAt: IsoDateTime,
  updatedBy: z.string(),
});
export type Inspection = z.infer<typeof InspectionSchema>;

/**
 * `config/inspection-counter.json` (final inspections) and `config/quality-check-counter.json`
 * (quality checks) — the last number given out this year.
 */
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
  /**
   * A final inspection's deviation or a quality check's. Rows written before quality checks could
   * be done have none: they are final inspections'. Insights counts the two kinds apart.
   */
  kind: InspectionKindSchema.default('final'),
  inspectionId: IdSchema,
  inspectionNumber: z.string(),
  serialNumber: z.string(),
  machineName: z.string(),
  modelCode: ModelCodeSchema,
  templateId: IdSchema,
  templateRevision: z.number().int(),
  itemId: z.string(),
  sectionTitle: z.string(),
  displayRef: z.string(),
  checkpointText: z.string(),
  comment: z.string(),
  resp: z.string(),
  severity: SeveritySchema,
  /** '' when none was chosen (and on rows written before categories existed). */
  category: z.string().default(''),
  /** "YYYY-MM-DD" */
  inspectionDate: z.string(),
  finalised: z.boolean(),
  createdAt: IsoDateTime,
  /**
   * The name of the checklist it was found with, as frozen in the inspection: "Quality check –
   * Pre start up" ('' on rows written before quality checks could be done).
   */
  checkName: z.string().default(''),
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
  /** 503: a storage step failed and nothing was changed, so the same request can be retried. */
  'unavailable',
] as const;
export const ApiErrorSchema = z.object({
  error: z.enum(API_ERROR_CODES),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/** User-facing text for an ETag mismatch (HTTP 412) — brief §3. */
export const CONFLICT_MESSAGE = 'Someone else changed this – reload to see the latest version.';
