/**
 * Storage layout (brief §3). Container names are fixed; blob names are relative to their container.
 *
 *   templates/{templateId}/draft.json
 *   templates/{templateId}/rev-{n}.json      immutable published revisions
 *   inspections/{inspectionId}.json
 *   images/{imageId}.jpg                     photos, and flattened copies of marked-up photos
 *   config/settings.json                     machine models, default location, company info, lists
 *   config/people.json                       who may use the app: name, email, role
 *   config/inspection-counter.json           counter for FI-YYYY-NNNN numbers (final inspections)
 *   config/quality-check-counter.json        counter for QC-YYYY-NNNN numbers (quality checks)
 *   follow-ups/{inspectionId}.json           its deviations' follow-up: open or closed, the action
 *
 * Table `deviations`: one row per deviation (KPI source).
 */
export const CONTAINERS = {
  templates: 'templates',
  inspections: 'inspections',
  images: 'images',
  config: 'config',
  /**
   * The follow-up of each inspection's deviations, one blob per inspection: apart from the
   * inspection, so closing a deviation never changes the inspection's version (its page saves
   * with If-Match) nor its findings.
   */
  followUps: 'follow-ups',
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
  /** Who may use the app, with their names and roles (admin-managed in Settings). */
  people: 'people.json',
  inspectionCounter: 'inspection-counter.json',
  /** The quality checks' own series, QC-YYYY-NNNN, counted like the inspections'. */
  qualityCheckCounter: 'quality-check-counter.json',
  /** In `follow-ups/`: whether each of the inspection's deviations is open or closed, and how. */
  followUps: (inspectionId: string) => `${inspectionId}.json`,
} as const;

/** Table Storage keys for a deviation row (brief §4). */
export function deviationKeys(
  modelCode: string,
  inspectionId: string,
  itemOrExtraId: string,
): { partitionKey: string; rowKey: string } {
  return { partitionKey: modelCode, rowKey: `${inspectionId}_${itemOrExtraId}` };
}
