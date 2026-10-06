/**
 * Template editing contract (brief §5.2, §8): request/response shapes for the template endpoints,
 * the rules a draft must pass before it can be published, and the "unpublished changes" check.
 * Used by the API (to enforce) and the editor (to show problems before the user hits Publish).
 */
import { z } from 'zod';
import { indexItems } from './numbering';
import {
  IdSchema,
  ModelCodeSchema,
  TemplateSchema,
  type PrintSettings,
  type Section,
  type Template,
} from './schemas';

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

/** POST /api/templates */
export const CreateTemplateRequestSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  modelCode: ModelCodeSchema,
});
export type CreateTemplateRequest = z.infer<typeof CreateTemplateRequestSchema>;

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
  /** Revision number the next publish will get (latest published + 1). */
  draftRevision: z.number().int().min(1),
  hasUnpublishedChanges: z.boolean(),
  itemCount: z.number().int().min(0),
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

export type PublishIssue = {
  /** Where the problem is, so the editor can highlight and scroll to it. */
  target:
    | { kind: 'template' }
    | { kind: 'section'; sectionId: string }
    | { kind: 'item'; sectionId: string; itemId: string };
  message: string;
};

/**
 * Everything that must hold before a draft becomes an immutable revision. Drafts may be
 * incomplete while being edited; a printed checklist may not.
 */
export function validateForPublish(template: Pick<Template, 'name' | 'sections'>): PublishIssue[] {
  const issues: PublishIssue[] = [];
  if (!template.name.trim()) {
    issues.push({ target: { kind: 'template' }, message: 'The template needs a name.' });
  }
  if (template.sections.length === 0) {
    issues.push({ target: { kind: 'template' }, message: 'Add at least one section.' });
  }
  template.sections.forEach((section, index) => {
    const label = `Section ${index + 1}`;
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
  });
  for (const item of indexItems(template.sections)) {
    if (!item.text.trim()) {
      issues.push({
        target: { kind: 'item', sectionId: item.sectionId, itemId: item.itemId },
        message: `Row ${item.ref} is empty.`,
      });
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------------------------
// Unpublished changes
// ---------------------------------------------------------------------------------------------

/** The content that a published revision freezes; metadata (dates, who, status) is ignored. */
function publishedContent(t: {
  name: string;
  modelCode: string;
  coverImageId?: string | undefined;
  printSettings: PrintSettings;
  sections: Section[];
}): string {
  // Built field by field so key order (and therefore the string) is stable.
  return JSON.stringify([
    t.name,
    t.modelCode,
    t.coverImageId ?? null,
    t.printSettings.spareRowsPerSection,
    t.sections.map((s) => [
      s.id,
      s.title,
      // Guides come out of zod parsing, which emits keys in schema order on both sides.
      s.items.map((i) => [i.id, i.text, i.guide ?? null]),
    ]),
  ]);
}

/** True when the draft differs from the latest published revision (or nothing is published). */
export function hasUnpublishedChanges(draft: Template, latestPublished: Template | null): boolean {
  if (!latestPublished) return true;
  return publishedContent(draft) !== publishedContent(latestPublished);
}
