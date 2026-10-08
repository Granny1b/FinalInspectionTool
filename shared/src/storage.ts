/**
 * Storage layout (brief §3). Container names are fixed; blob names are relative to their container.
 *
 *   templates/{templateId}/draft.json
 *   templates/{templateId}/rev-{n}.json      immutable published revisions
 *   inspections/{inspectionId}.json
 *   images/{imageId}.jpg                     photos, and flattened copies of marked-up photos
 *   config/settings.json                     machine models, default location, company info
 *   config/inspection-counter.json           counter for FI-YYYY-NNNN numbers
 *
 * Table `deviations`: one row per deviation (KPI source).
 */
export const CONTAINERS = {
  templates: 'templates',
  inspections: 'inspections',
  images: 'images',
  config: 'config',
} as const;
export type ContainerName = (typeof CONTAINERS)[keyof typeof CONTAINERS];

export const DEVIATIONS_TABLE = 'deviations';

/** Name of the app setting / env var holding the storage connection string (server-side only). */
export const STORAGE_CONNECTION_STRING_ENV = 'STORAGE_CONNECTION_STRING';

export const blobNames = {
  templateDraft: (templateId: string) => `${templateId}/draft.json`,
  templateRevision: (templateId: string, revision: number) => `${templateId}/rev-${revision}.json`,
  /** Matches `rev-{n}.json` (the part after `{templateId}/`) and captures n. */
  templateRevisionPattern: /^rev-(\d+)\.json$/,
  inspection: (inspectionId: string) => `${inspectionId}.json`,
  image: (imageId: string) => `${imageId}.jpg`,
  settings: 'settings.json',
  inspectionCounter: 'inspection-counter.json',
} as const;

/** Table Storage keys for a deviation row (brief §4). */
export function deviationKeys(
  modelCode: string,
  inspectionId: string,
  itemOrExtraId: string,
): { partitionKey: string; rowKey: string } {
  return { partitionKey: modelCode, rowKey: `${inspectionId}_${itemOrExtraId}` };
}
