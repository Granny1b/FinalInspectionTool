/**
 * Template editing contract (brief §5.2, §8): request/response shapes for the template endpoints,
 * the rules a draft must pass before it can be published, and the "unpublished changes" check.
 * Used by the API (to enforce) and the editor (to show problems before the user hits Publish).
 */
import { z } from 'zod';
import { rowRef } from './numbering';
import {
  IdSchema,
  MachineModelSchema,
  ModelCodeSchema,
  QualityFrontSchema,
  TemplateKindSchema,
  TemplateSchema,
  type MachineModel,
  type QualityFront,
  type Section,
  type Template,
  type TemplateKind,
} from './schemas';
import { QualityCheckExportSchema, TemplateExportSchema } from './templateTransfer';

const IsoDateTime = z.iso.datetime({ offset: true });

/**
 * The parts of a draft the editor may change. `id`, `kind`, `parentId`, `revision`, `status`,
 * `updatedAt` and `updatedBy` are owned by the server and never taken from the client. A quality
 * check's editor sends its front page (`quality`); its name follows from it and its model is its
 * machine's, whatever is sent.
 */
export const TemplateDraftInputSchema = TemplateSchema.pick({
  name: true,
  modelCode: true,
  coverImageId: true,
  quality: true,
  sections: true,
});
export type TemplateDraftInput = z.infer<typeof TemplateDraftInputSchema>;

const TemplateNameSchema = z.string().trim().min(1, 'Name is required').max(200);

/** A quality check's name ("Pre start up"), required when it is created and to publish it. */
const QualityNameSchema = z.string().trim().min(1, 'Name is required').max(200);

/** A machine model created along with its template must have the template's model code. */
const newModelMatches = {
  check: (request: { modelCode: string; newModel?: MachineModel | undefined }) =>
    !request.newModel || request.newModel.code === request.modelCode,
  params: { message: "The new machine model's code must be the template's model code." },
};

/**
 * POST /api/templates. `newModel` is a machine model launched since: the server adds it to the
 * settings first (409 if its code or name is already there), so a template never waits for an
 * admin to edit the settings.
 */
export const CreateTemplateRequestSchema = z
  .object({
    /** A final inspection template (the default); see CreateQualityCheckRequestSchema. */
    kind: z.literal('final').optional(),
    name: TemplateNameSchema,
    modelCode: ModelCodeSchema,
    newModel: MachineModelSchema.optional(),
  })
  .refine(newModelMatches.check, { ...newModelMatches.params, path: ['newModel', 'code'] });
export type CreateTemplateRequest = z.infer<typeof CreateTemplateRequestSchema>;

/**
 * POST /api/templates with `kind: 'quality'`: a new, empty quality check under the machine whose
 * final inspection template is `parentId`. It gets that template's model; its title is
 * "Quality check – {name}".
 */
export const CreateQualityCheckRequestSchema = z.object({
  kind: z.literal('quality'),
  parentId: IdSchema,
  name: QualityNameSchema,
});
export type CreateQualityCheckRequest = z.infer<typeof CreateQualityCheckRequestSchema>;

/** Everything POST /api/templates accepts: a final inspection template or a quality check. */
export const CreateAnyTemplateRequestSchema = z.union([
  CreateQualityCheckRequestSchema,
  CreateTemplateRequestSchema,
]);

/**
 * POST /api/templates/import: a new draft from a template file (templateTransfer.ts), for the
 * model and under the name the admin chose; `newModel` as for creating a template.
 */
export const ImportTemplateRequestSchema = z
  .object({
    kind: z.literal('final').optional(),
    name: TemplateNameSchema,
    modelCode: ModelCodeSchema,
    newModel: MachineModelSchema.optional(),
    file: TemplateExportSchema,
  })
  .refine(newModelMatches.check, { ...newModelMatches.params, path: ['newModel', 'code'] });
export type ImportTemplateRequest = z.infer<typeof ImportTemplateRequestSchema>;

/**
 * POST /api/templates/import with `kind: 'quality'`: a new quality check draft from a quality
 * check file, under the machine whose final inspection template is `parentId`, with the name the
 * admin chose (the rest of the front page comes from the file).
 */
export const ImportQualityCheckRequestSchema = z.object({
  kind: z.literal('quality'),
  parentId: IdSchema,
  name: QualityNameSchema,
  file: QualityCheckExportSchema,
});
export type ImportQualityCheckRequest = z.infer<typeof ImportQualityCheckRequestSchema>;

/** Everything POST /api/templates/import accepts. */
export const ImportAnyTemplateRequestSchema = z.union([
  ImportQualityCheckRequestSchema,
  ImportTemplateRequestSchema,
]);

/** POST /api/templates/{id}/publish */
export const PublishTemplateRequestSchema = z.object({
  changeNote: z.string().trim().max(1000).optional(),
});
export type PublishTemplateRequest = z.infer<typeof PublishTemplateRequestSchema>;

/** One line of the revision history (brief §5.2: revision, date, who, note). */
export const TemplateRevisionInfoSchema = z.object({
  revision: z.number().int().min(1),
  publishedAt: IsoDateTime,
  publishedBy: z.string(),
  changeNote: z.string().optional(),
});
export type TemplateRevisionInfo = z.infer<typeof TemplateRevisionInfoSchema>;

/** GET /api/templates — one entry per template, final inspections and quality checks alike. */
export const TemplateSummarySchema = z.object({
  id: IdSchema,
  kind: TemplateKindSchema.default('final'),
  /** A quality check's machine: its final inspection template. */
  parentId: IdSchema.optional(),
  name: z.string(),
  modelCode: ModelCodeSchema,
  /** Latest published revision, or null if the template has never been published. */
  publishedRevision: z.number().int().min(1).nullable(),
  /**
   * Name and model of that revision: what a new inspection copies. They differ from `name` and
   * `modelCode` (the draft's) while an admin's change is unpublished.
   */
  publishedName: z.string().nullable(),
  publishedModelCode: ModelCodeSchema.nullable(),
  /** Revision number the next publish will get (latest published + 1). */
  draftRevision: z.number().int().min(1),
  hasUnpublishedChanges: z.boolean(),
  itemCount: z.number().int().min(0),
  /** The draft's cover photo, for the card view. */
  coverImageId: IdSchema.optional(),
  /** Quality checks only, from the draft: the front page, the section titles and the time. */
  quality: QualityFrontSchema.optional(),
  sectionTitles: z.array(z.string()).optional(),
  totalHours: z.number().min(0).optional(),
  /**
   * Quality checks only: its place among its machine model's quality checks (0 first), as an
   * admin ordered them. Left out for one not ordered yet, which comes after them by title.
   */
  position: z.number().int().min(0).optional(),
  updatedAt: IsoDateTime,
  updatedBy: z.string(),
});
export type TemplateSummary = z.infer<typeof TemplateSummarySchema>;

/**
 * `config/quality-check-orders/{templateId}.json`, and GET/PUT
 * /api/templates/{id}/quality-check-order: the order of a machine model's quality checks (their
 * template ids), as admins drag them on its Quality checks tab. It is the order they are offered
 * in when a machine is made, and the order of a machine's checks. One not in it comes after the
 * ones that are, by title.
 */
export const QualityCheckOrderSchema = z.object({ order: z.array(IdSchema).max(500) });
export type QualityCheckOrder = z.infer<typeof QualityCheckOrderSchema>;

/** Quality checks by their place in their model's order, then by title. */
export function compareQualityChecks(
  a: Pick<TemplateSummary, 'position' | 'name' | 'id'>,
  b: Pick<TemplateSummary, 'position' | 'name' | 'id'>,
): number {
  const position = (check: Pick<TemplateSummary, 'position'>) =>
    check.position ?? Number.MAX_SAFE_INTEGER;
  return position(a) - position(b) || byTitle.compare(a.name, b.name) || a.id.localeCompare(b.id);
}

const byTitle = new Intl.Collator('sv', { sensitivity: 'base', numeric: true });
export const TemplateListSchema = z.array(TemplateSummarySchema);

/** GET /api/templates/{id} (admin) and POST …/publish. The draft's ETag is in the ETag header. */
export const TemplateDetailSchema = z.object({
  draft: TemplateSchema,
  /** Newest first. */
  revisions: z.array(TemplateRevisionInfoSchema),
  hasUnpublishedChanges: z.boolean(),
});
export type TemplateDetail = z.infer<typeof TemplateDetailSchema>;

/** 201 from POST /api/templates/import: the new draft (ETag in the header) and what was left out. */
export const ImportTemplateResponseSchema = TemplateDetailSchema.extend({
  /**
   * Image ids of the file (cover, guide images, their marked-up copies) left out because those
   * images are not stored in this installation.
   */
  droppedImages: z.number().int().min(0),
});
export type ImportTemplateResponse = z.infer<typeof ImportTemplateResponseSchema>;

/** PUT /api/templates/{id} — the saved draft; the new ETag is in the ETag header. */
export const SaveTemplateResponseSchema = z.object({
  draft: TemplateSchema,
  hasUnpublishedChanges: z.boolean(),
});
export type SaveTemplateResponse = z.infer<typeof SaveTemplateResponseSchema>;

/** POST /api/images/upload-url (brief §8). PUT the JPEG to `sasUrl` with x-ms-blob-type: BlockBlob. */
export const ImageUploadUrlResponseSchema = z.object({
  imageId: IdSchema,
  sasUrl: z.url(),
  expiresAt: IsoDateTime,
});
export type ImageUploadUrlResponse = z.infer<typeof ImageUploadUrlResponseSchema>;

/** GET /api/images/{id}/url — short-lived read URL. */
export const ImageReadUrlResponseSchema = z.object({
  url: z.url(),
  expiresAt: IsoDateTime,
});
export type ImageReadUrlResponse = z.infer<typeof ImageReadUrlResponseSchema>;

// ---------------------------------------------------------------------------------------------
// Publish rules
// ---------------------------------------------------------------------------------------------

/** One problem; a 400 from …/publish carries the list in `details`. */
export const PublishIssueSchema = z.object({
  /** Where the problem is, so the editor can highlight and scroll to it. */
  target: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('template') }),
    z.object({ kind: z.literal('section'), sectionId: z.string() }),
    z.object({ kind: z.literal('item'), sectionId: z.string(), itemId: z.string() }),
  ]),
  message: z.string(),
});
export type PublishIssue = z.infer<typeof PublishIssueSchema>;

/**
 * Everything that must hold before a draft becomes an immutable revision. Drafts may be
 * incomplete while being edited; a printed checklist may not. Problems come in document order,
 * so a list of them reads top to bottom like the checklist.
 *
 * A section may have no rows yet: an admin can publish a heading as a reminder of what is still
 * to be added, and it prints as its heading over "No checkpoints in this section." The checklist
 * as a whole needs a row, though: an inspection of it would have nothing to check, could never
 * show a status and would finalise as an empty report. A row needs its text: a checkpoint without
 * one would reach inspections.
 */
export function validateForPublish(template: {
  name: string;
  sections: Section[];
  /** Final when left out. */
  kind?: TemplateKind | undefined;
  quality?: QualityFront | undefined;
}): PublishIssue[] {
  const issues: PublishIssue[] = [];
  const quality = template.kind === 'quality';
  // A quality check's title follows from the name on its front page.
  if (quality && !template.quality?.name.trim()) {
    issues.push({ target: { kind: 'template' }, message: 'The quality check needs a name.' });
  } else if (!quality && !template.name.trim()) {
    issues.push({ target: { kind: 'template' }, message: 'The template needs a name.' });
  }
  if (template.sections.length === 0) {
    issues.push({ target: { kind: 'template' }, message: 'Add at least one section.' });
  } else if (template.sections.every((section) => section.items.length === 0)) {
    issues.push({ target: { kind: 'template' }, message: 'Add at least one row.' });
  }
  template.sections.forEach((section, sectionIndex) => {
    if (!section.title.trim()) {
      issues.push({
        target: { kind: 'section', sectionId: section.id },
        message: `Section ${sectionIndex + 1} needs a title.`,
      });
    }
    section.items.forEach((item, rowIndex) => {
      if (!item.text.trim()) {
        issues.push({
          target: { kind: 'item', sectionId: section.id, itemId: item.id },
          message: quality
            ? `Row ${rowRef(sectionIndex, rowIndex)} needs “What to check”.`
            : `Row ${rowRef(sectionIndex, rowIndex)} is empty.`,
        });
      }
    });
  });
  return issues;
}

// ---------------------------------------------------------------------------------------------
// Unpublished changes
// ---------------------------------------------------------------------------------------------

/** What a published revision freezes: everything but metadata (dates, who, status, revision). */
type TemplateContent = {
  name: string;
  modelCode: string;
  coverImageId?: string | undefined;
  quality?: QualityFront | undefined;
  sections: Section[];
};

function publishedContent(t: TemplateContent): string {
  // Built field by field so key order (and therefore the string) is stable, and fields a stored
  // template may still carry from an earlier version (printSettings, a section's spareRows) are
  // no change. A quality check's front page and its rows' how, references and time count too; a
  // blank how or an empty list of references is the same as none.
  const front = t.quality;
  return JSON.stringify([
    t.name,
    t.modelCode,
    t.coverImageId ?? null,
    front ? [front.name, front.department] : null,
    t.sections.map((s) => [
      s.id,
      s.title,
      // Guides come out of zod parsing, which emits keys in schema order on both sides.
      s.items.map((i) => [
        i.id,
        i.text,
        i.guide ?? null,
        i.how || null,
        i.references?.length ? i.references : null,
        i.timeHours ?? null,
      ]),
    ]),
  ]);
}

/** True when two templates (or a template and the editor's draft input) have the same content. */
export function sameTemplateContent(a: TemplateContent, b: TemplateContent): boolean {
  return publishedContent(a) === publishedContent(b);
}

/** True when the draft differs from the latest published revision (or nothing is published). */
export function hasUnpublishedChanges(draft: Template, latestPublished: Template | null): boolean {
  return !latestPublished || !sameTemplateContent(draft, latestPublished);
}

// ---------------------------------------------------------------------------------------------
// New machine models
// ---------------------------------------------------------------------------------------------

/** Codes and names compare without regard to case: "rmmg" would be a second RMMG to people. */
const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Why `model` can't be added next to `models` (its code or its name is taken), or null. The API
 * answers 409 with the message; the dialogs show it at the field before sending.
 */
export function newModelConflict(
  models: readonly MachineModel[],
  model: MachineModel,
): { field: 'code' | 'name'; message: string } | null {
  const sameCode = models.find((existing) => sameText(existing.code, model.code));
  if (sameCode) {
    return { field: 'code', message: `${sameCode.code} is already the code of ${sameCode.name}.` };
  }
  const sameName = models.find((existing) => sameText(existing.name, model.name));
  if (sameName) {
    return {
      field: 'name',
      message: `There is already a machine model called ${sameName.name} (${sameName.code}).`,
    };
  }
  return null;
}
