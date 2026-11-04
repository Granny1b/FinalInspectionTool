/**
 * Templates as JSON files (export and import between installations, or as a backup). The file
 * holds the checklist and its print settings; images (cover, guide images) are referenced by id,
 * so they come along only within the same installation, where those images exist.
 */
import { z } from 'zod';
import { PrintSettingsSchema, SectionSchema, IdSchema, ModelCodeSchema } from './schemas';

export const TEMPLATE_EXPORT_FORMAT = 'modig-final-inspection/template';

export const TemplateExportSchema = z.object({
  format: z.literal(TEMPLATE_EXPORT_FORMAT),
  version: z.literal(1),
  exportedAt: z.iso.datetime({ offset: true }),
  template: z.object({
    name: z.string().max(200),
    /** The model it was made for; an import may choose another. */
    modelCode: ModelCodeSchema,
    /** The model's name, so an import into an installation without that model can create it. */
    modelName: z.string().max(100).optional(),
    coverImageId: IdSchema.optional(),
    printSettings: PrintSettingsSchema,
    sections: z.array(SectionSchema),
  }),
});
export type TemplateExport = z.infer<typeof TemplateExportSchema>;
