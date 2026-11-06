/**
 * Templates as JSON files (export and import between installations, or as a backup). The file
 * holds the checklist; images (cover, guide images) are referenced by id, so they come along only
 * within the same installation, where those images exist. Files exported before spare lines were
 * removed also hold `printSettings` and sections' `spareRows`: still version 1, they import as
 * before, without those fields (zod strips unknown keys).
 *
 * A quality check is a file of its own format (`…/quality-check`), so neither import takes the
 * other's file: a final inspection template file stays exactly as it was.
 */
import { z } from 'zod';
import { newId } from './ids';
import {
  IdSchema,
  ModelCodeSchema,
  QualityFrontSchema,
  SectionSchema,
  type Section,
  type Template,
} from './schemas';

export const TEMPLATE_EXPORT_FORMAT = 'modig-final-inspection/template';
export const QUALITY_CHECK_EXPORT_FORMAT = 'modig-final-inspection/quality-check';

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
    sections: z.array(SectionSchema),
  }),
});
export type TemplateExport = z.infer<typeof TemplateExportSchema>;

/** A quality check's file: its front page and checklist (rows with how, references and time). */
export const QualityCheckExportSchema = z.object({
  format: z.literal(QUALITY_CHECK_EXPORT_FORMAT),
  version: z.literal(1),
  exportedAt: z.iso.datetime({ offset: true }),
  qualityCheck: z.object({
    quality: QualityFrontSchema,
    /** Its machine's model; an import puts it under the machine it is imported on. */
    modelCode: ModelCodeSchema,
    modelName: z.string().max(100).optional(),
    sections: z.array(SectionSchema),
  }),
});
export type QualityCheckExport = z.infer<typeof QualityCheckExportSchema>;

/** What a file is made from, and what an import builds a draft from. */
type Checklist = {
  coverImageId?: string | undefined;
  sections: Section[];
};

/** The file for a template: its draft as the editor shows it, with the model's name. */
export function templateExport(
  template: Pick<Template, 'name' | 'modelCode' | 'coverImageId' | 'sections'>,
  modelName: string | undefined,
  exportedAt: string,
): TemplateExport {
  const { name, modelCode, coverImageId, sections } = template;
  return {
    format: TEMPLATE_EXPORT_FORMAT,
    version: 1,
    exportedAt,
    template: {
      name,
      modelCode,
      ...(modelName && { modelName }),
      ...(coverImageId && { coverImageId }),
      sections,
    },
  };
}

/** The file for a quality check: its draft as the editor shows it, with its machine's name. */
export function qualityCheckExport(
  check: Pick<Template, 'modelCode' | 'quality' | 'sections'>,
  modelName: string | undefined,
  exportedAt: string,
): QualityCheckExport {
  const { quality, modelCode, sections } = check;
  return {
    format: QUALITY_CHECK_EXPORT_FORMAT,
    version: 1,
    exportedAt,
    qualityCheck: {
      quality: quality ?? { name: '', department: '' },
      modelCode,
      ...(modelName && { modelName }),
      sections,
    },
  };
}

/** Every image id a template refers to: its cover, its guide images and their marked-up copies. */
export function templateImageIds({ coverImageId, sections }: Checklist): string[] {
  const ids = new Set<string>();
  if (coverImageId) ids.add(coverImageId);
  for (const image of sections.flatMap((s) => s.items.flatMap((i) => i.guide?.images ?? []))) {
    ids.add(image.imageId);
    if (image.renderedImageId) ids.add(image.renderedImageId);
  }
  return [...ids];
}

/**
 * The checklist without the images that are not `available` (a file from another installation),
 * and how many of its image ids were left out. A guide image goes when its photo is missing, and
 * loses only its marked-up copy when that is; a guide left with nothing in it goes too.
 */
export function withAvailableImages<T extends Checklist>(
  template: T,
  available: ReadonlySet<string>,
): { template: T; dropped: number } {
  const before = templateImageIds(template).length;
  const { coverImageId, ...rest } = template;
  const sections = template.sections.map((section) => ({
    ...section,
    items: section.items.map(({ guide, ...item }) => {
      if (!guide) return item;
      const images = guide.images
        .filter((image) => available.has(image.imageId))
        .map((image) => {
          if (!image.renderedImageId || available.has(image.renderedImageId)) return image;
          const { renderedImageId: _missing, ...photo } = image;
          return photo;
        });
      return guide.description || images.length > 0
        ? { ...item, guide: { ...guide, images } }
        : item;
    }),
  }));
  const kept = {
    ...rest,
    ...(coverImageId && available.has(coverImageId) && { coverImageId }),
    sections,
  } as T;
  return { template: kept, dropped: before - templateImageIds(kept).length };
}

/**
 * The same sections with a fresh id for every section and row: for an import whose ids another
 * template already uses (ids are unique for good, and KPIs follow a row by its id).
 */
export function withNewIds(sections: readonly Section[], makeId: () => string = newId): Section[] {
  return sections.map((section) => ({
    ...section,
    id: makeId(),
    items: section.items.map((item) => ({ ...item, id: makeId() })),
  }));
}

/** Every section and row id of the sections. */
export function checklistIds(sections: readonly Section[]): string[] {
  return sections.flatMap((section) => [section.id, ...section.items.map((item) => item.id)]);
}
