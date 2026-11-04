/**
 * Templates as JSON files: Export JSON writes the editor's draft to a file in the browser; Import
 * JSON reads and checks a file here, so a wrong file is explained before anything is sent.
 */
import {
  TEMPLATE_EXPORT_FORMAT,
  templateExport,
  TemplateExportSchema,
  type TemplateDraftInput,
  type TemplateExport,
} from '@modig/shared';

/** A failure with a message meant for the user. */
export class TemplateFileError extends Error {
  override name = 'TemplateFileError';
}

/** Far more than a 90-row checklist with guides (tens of kilobytes): anything bigger is not one. */
const MAX_FILE_BYTES = 5 * 1024 * 1024;
/** The longest file name, without ".json". */
const FILE_NAME_LENGTH = 150;

/**
 * "Final inspection – RigiMill MG.json": the template's name with the characters Windows and macOS
 * refuse in file names replaced, and not too long.
 */
export function templateFileName(name: string): string {
  const safe = name
    .replace(/\s+/g, ' ')
    // eslint-disable-next-line no-control-regex -- control characters are exactly what is replaced
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '-')
    .trim()
    .slice(0, FILE_NAME_LENGTH)
    .replace(/[\s.]+$/, '');
  return `${safe || 'Template'}.json`;
}

/** Downloads the draft, as the editor shows it, as a template file. */
export function downloadTemplate(draft: TemplateDraftInput, modelName: string | undefined): void {
  const file = templateExport(draft, modelName, new Date().toISOString());
  // Indented: the file is small, and readable in a text editor.
  const blob = new Blob([`${JSON.stringify(file, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = templateFileName(draft.name);
  document.body.append(link);
  link.click();
  link.remove();
  // The download has started from the URL by then; a moment later it can go.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Checks a template file's text; a TemplateFileError says in words what is wrong with it. */
export function parseTemplateFile(text: string): TemplateExport {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new TemplateFileError('This file is not a template file: it does not contain JSON.');
  }
  const header = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : {};
  if (header.format !== TEMPLATE_EXPORT_FORMAT) {
    throw new TemplateFileError(
      'This is not a template file. Choose a file made with Export JSON in a template.',
    );
  }
  if (header.version !== 1) {
    throw new TemplateFileError(
      'This template file was made by a newer version of the app, which this one cannot read.',
    );
  }
  const result = TemplateExportSchema.safeParse(json);
  if (!result.success) {
    const [issue] = result.error.issues;
    const where = issue?.path.length ? ` (at ${issue.path.join('.')})` : '';
    throw new TemplateFileError(`This template file is damaged or incomplete${where}.`);
  }
  return result.data;
}

/** Reads and checks a chosen file. */
export async function readTemplateFile(file: Blob): Promise<TemplateExport> {
  if (file.size > MAX_FILE_BYTES) {
    throw new TemplateFileError('This file is too big to be a template file.');
  }
  return parseTemplateFile(await file.text());
}
