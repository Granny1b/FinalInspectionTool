/**
 * Quality checks as JSON files: Export JSON writes the editor's draft to a file in the browser;
 * Import JSON (on a machine's Quality checks tab) reads and checks a file here, so a wrong file is
 * explained before anything is sent. A final inspection template's file is not one.
 */
import {
  QUALITY_CHECK_EXPORT_FORMAT,
  qualityCheckExport,
  QualityCheckExportSchema,
  qualityCheckTitle,
  TEMPLATE_EXPORT_FORMAT,
  type QualityCheckExport,
  type TemplateDraftInput,
} from '@modig/shared';
import {
  downloadJson,
  MAX_FILE_BYTES,
  TemplateFileError,
  templateFileName,
} from '../templates/transfer';

/**
 * "Quality check – Pre start up – RigiMill MG.json": the title and the machine, with the
 * characters Windows and macOS refuse in file names replaced.
 */
export function qualityCheckFileName(
  front: { name: string } | undefined,
  machine: string | undefined,
): string {
  const title = front ? qualityCheckTitle(front) : '';
  const name = [title || 'Quality check', machine?.trim()].filter(Boolean).join(' – ');
  return templateFileName(name);
}

/** Downloads the quality check's draft, as the editor shows it, as a quality check file. */
export function downloadQualityCheck(
  draft: TemplateDraftInput,
  modelName: string | undefined,
): void {
  const file = qualityCheckExport(draft, modelName, new Date().toISOString());
  downloadJson(file, qualityCheckFileName(draft.quality, modelName));
}

/** Checks a quality check file's text; a TemplateFileError says in words what is wrong with it. */
export function parseQualityCheckFile(text: string): QualityCheckExport {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new TemplateFileError('This file is not a quality check file: it does not contain JSON.');
  }
  const header = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : {};
  if (header.format === TEMPLATE_EXPORT_FORMAT) {
    throw new TemplateFileError(
      'This is a final inspection template file. Import it with Import JSON on the Templates page.',
    );
  }
  if (header.format !== QUALITY_CHECK_EXPORT_FORMAT) {
    throw new TemplateFileError(
      'This is not a quality check file. Choose a file made with Export JSON in a quality check.',
    );
  }
  if (header.version !== 1) {
    throw new TemplateFileError(
      'This quality check file was made by a newer version of the app, which this one cannot read.',
    );
  }
  const result = QualityCheckExportSchema.safeParse(json);
  if (!result.success) {
    const [issue] = result.error.issues;
    const where = issue?.path.length ? ` (at ${issue.path.join('.')})` : '';
    throw new TemplateFileError(`This quality check file is damaged or incomplete${where}.`);
  }
  return result.data;
}

/** Reads and checks a chosen file. */
export async function readQualityCheckFile(file: Blob): Promise<QualityCheckExport> {
  if (file.size > MAX_FILE_BYTES) {
    throw new TemplateFileError('This file is too big to be a quality check file.');
  }
  return parseQualityCheckFile(await file.text());
}
