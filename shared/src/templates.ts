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
  sectionSpareRows,
  TemplateSchema,
  type MachineModel,
  type PrintSettings,
  type Section,
  type Template,
} from './schemas';
import { TemplateExportSchema } from './templateTransfer';

const IsoDateTime = z.iso.datetime({ offset: true });

/**
 * The parts of a draft the editor may change. `id`, `revision`, `status`, `updatedAt` and
 * `updatedBy` are owned by the server and never taken from the client.
 */
export const TemplateDraftInputSchema = TemplateSchema.pick({
  name: true,
  modelCode: true,
  coverImageId: true,
  printSettings: true,
  sections: true,
});
export type TemplateDraftInput = z.infer<typeof TemplateDraftInputSchema>;

const TemplateNameSchema = z.string().trim().min(1, 'Name is required').max(200);

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
    name: TemplateNameSchema,
    modelCode: ModelCodeSchema,
    newModel: MachineModelSchema.optional(),
  })
  .refine(newModelMatches.check, { ...newModelMatches.params, path: ['newModel', 'code'] });
export type CreateTemplateRequest = z.infer<typeof CreateTemplateRequestSchema>;

/**
 * POST /api/templates/import: a new draft from a template file (templateTransfer.ts), for the
 * model and under the name the admin chose; `newModel` as for creating a template.
 */
export const ImportTemplateRequestSchema = z
  .object({
    name: TemplateNameSchema,
    modelCode: ModelCodeSchema,
    newModel: MachineModelSchema.optional(),
    file: TemplateExportSchema,
  })
  .refine(newModelMatches.check, { ...newModelMatches.params, path: ['newModel', 'code'] });
export type ImportTemplateRequest = z.infer<typeof ImportTemplateRequestSchema>;

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

/** GET /api/templates — one entry per template. */
export const TemplateSummarySchema = z.object({
  id: IdSchema,
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
  updatedAt: IsoDateTime,
  updatedBy: z.string(),
});
export type TemplateSummary = z.infer<typeof TemplateSummarySchema>;
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
 */
export function validateForPublish(template: Pick<Template, 'name' | 'sections'>): PublishIssue[] {
  const issues: PublishIssue[] = [];
  if (!template.name.trim()) {
    issues.push({ target: { kind: 'template' }, message: 'The template needs a name.' });
  }
  if (template.sections.length === 0) {
    issues.push({ target: { kind: 'template' }, message: 'Add at least one section.' });
  }
  template.sections.forEach((section, sectionIndex) => {
    const label = `Section ${sectionIndex + 1}`;
    if (!section.title.trim()) {
      issues.push({
        target: { kind: 'section', sectionId: section.id },
        message: `${label} needs a title.`,
      });
    }
    if (section.items.length === 0) {
      issues.push({
        target: { kind: 'section', sectionId: section.id },
        message: `${label} has no rows.`,
      });
    }
    section.items.forEach((item, rowIndex) => {
      if (!item.text.trim()) {
        issues.push({
          target: { kind: 'item', sectionId: section.id, itemId: item.id },
          message: `Row ${rowRef(sectionIndex, rowIndex)} is empty.`,
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
  printSettings: PrintSettings;
  sections: Section[];
};

function publishedContent(t: TemplateContent): string {
  // Built field by field so key order (and therefore the string) is stable.
  return JSON.stringify([
    t.name,
    t.modelCode,
    t.coverImageId ?? null,
    t.printSettings.spareRowsPerSection,
    t.sections.map((s) => [
      s.id,
      s.title,
      // The lines it prints: a section's own count equal to the default is no change on paper.
      sectionSpareRows(s, t.printSettings),
      // Guides come out of zod parsing, which emits keys in schema order on both sides.
      s.items.map((i) => [i.id, i.text, i.guide ?? null]),
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

const MAX_MODEL_CODE = ModelCodeSchema.maxLength ?? 32;

/**
 * A code for a new model, from its name: its letters and digits in upper case ("RigiMill MG 2" →
 * "RIGIMILLMG2", "Åsa" → "ASA"), with a number added if a model already has it. '' for a name
 * without any.
 */
export function suggestModelCode(name: string, models: readonly MachineModel[]): string {
  const base = name
    .normalize('NFD')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, MAX_MODEL_CODE);
  if (!base) return '';
  const taken = (code: string) => models.some((model) => sameText(model.code, code));
  let n = 1;
  while (taken(candidate(base, n))) n++;
  return candidate(base, n);
}

/** `base` for 1, else `base` shortened to leave room for the number. */
function candidate(base: string, n: number): string {
  if (n === 1) return base;
  const suffix = String(n);
  return `${base.slice(0, MAX_MODEL_CODE - suffix.length)}${suffix}`;
}
