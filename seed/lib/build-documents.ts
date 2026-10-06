/**
 * Turns a parsed workbook into the documents the app stores (brief §3, §4). Pure; every
 * document is validated with the shared schema so nothing malformed ever reaches storage.
 */
import {
  DEFAULT_COMPANY_NAME,
  DEFAULT_SPARE_ROWS_PER_SECTION,
  SettingsSchema,
  TemplateSchema,
  type MachineModel,
  type Settings,
  type Template,
} from '@modig/shared';
import type { ParsedWorkbook } from './parse-workbook';

/** The checklist sheet (Slutkontroll_RM_MG) is the RigiMill MG checklist. */
export const TEMPLATE_MODEL_CODE = 'RMMG';
export const SEED_USER = 'seed';

export type TemplateDocuments = { published: Template; draft: Template };

/**
 * The imported checklist becomes published revision N (N from the workbook's "Rev: N") plus a
 * draft carrying N + 1, as every draft does (brief §4). Both share section and item ids:
 * item ids are stable across revisions.
 */
export function buildTemplateDocuments(
  parsed: ParsedWorkbook,
  options: { templateId: string; sourceFile: string; now: string },
): TemplateDocuments {
  const model = parsed.models.find((m) => m.code === TEMPLATE_MODEL_CODE);
  if (!model) {
    throw new Error(
      `Machine model ${TEMPLATE_MODEL_CODE} is missing from the workbook's model list`,
    );
  }
  const published = TemplateSchema.parse({
    id: options.templateId,
    name: `Final inspection – ${model.name}`,
    modelCode: model.code,
    revision: parsed.publishedRevision,
    status: 'published',
    printSettings: { spareRowsPerSection: DEFAULT_SPARE_ROWS_PER_SECTION },
    sections: parsed.sections,
    changeNote: `Imported from ${options.sourceFile}`,
    updatedAt: options.now,
    updatedBy: `${SEED_USER} (${options.sourceFile})`,
  } satisfies Template);

  // The change note describes the published revision, not the next one being drafted.
  const { changeNote: _changeNote, ...content } = published;
  const draft = TemplateSchema.parse({
    ...content,
    status: 'draft',
    revision: published.revision + 1,
  } satisfies Template);

  return { published, draft };
}

export function buildSettings(parsed: ParsedWorkbook, now: string): Settings {
  return SettingsSchema.parse({
    machineModels: parsed.models,
    defaultLocation: parsed.defaultLocation,
    companyName: DEFAULT_COMPANY_NAME,
    updatedAt: now,
    updatedBy: SEED_USER,
  } satisfies Settings);
}

/**
 * Workbook models whose code is not in the stored list yet. Models already stored are left
 * alone, so a renamed model is never reverted by re-running the seed.
 */
export function missingModels(
  stored: readonly MachineModel[],
  fromWorkbook: readonly MachineModel[],
): MachineModel[] {
  const storedCodes = new Set(stored.map((m) => m.code));
  return fromWorkbook.filter((m) => !storedCodes.has(m.code));
}
