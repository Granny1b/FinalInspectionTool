/**
 * Assembly instructions as JSON files: Export JSON writes the editor's draft to a file in the
 * browser; Import JSON reads and checks files here, so a wrong one is explained before anything is
 * sent. The file can also be written by hand or by a script (see shared/src/assembly.ts).
 */
import {
  ASSEMBLY_EXPORT_FORMAT,
  assemblyExport,
  AssemblyExportSchema,
  QUALITY_CHECK_EXPORT_FORMAT,
  TEMPLATE_EXPORT_FORMAT,
  type AssemblyExport,
  type TemplateDraftInput,
} from '@modig/shared';
import { downloadJson, TemplateFileError, templateFileName } from '../templates/transfer';

/** The build of a whole machine with every step's details is a few hundred kilobytes. */
const MAX_ASSEMBLY_FILE_BYTES = 10 * 1024 * 1024;

/** "HHV-3 24-Tools scheme – HHV 3.json": the instruction's name and its machine model. */
export function assemblyFileName(name: string, model: string | undefined): string {
  return templateFileName(
    [name.trim() || 'Assembly instruction', model?.trim()].filter(Boolean).join(' – '),
  );
}

/** Downloads the instruction's draft, as the editor shows it, as an assembly instruction file. */
export function downloadAssembly(draft: TemplateDraftInput, modelName: string | undefined): void {
  const file = assemblyExport(draft, modelName, new Date().toISOString());
  downloadJson(file, assemblyFileName(draft.name, modelName));
}

/** Checks a file's text; a TemplateFileError says in words what is wrong with it. */
export function parseAssemblyFile(text: string): AssemblyExport {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new TemplateFileError('It does not contain JSON.');
  }
  const header = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : {};
  if (header.format === TEMPLATE_EXPORT_FORMAT) {
    throw new TemplateFileError(
      'It is a final inspection template file. Import it with Import JSON on the Templates page.',
    );
  }
  if (header.format === QUALITY_CHECK_EXPORT_FORMAT) {
    throw new TemplateFileError(
      'It is a quality check file. Import it on the Quality checks tab of a machine’s template.',
    );
  }
  if (header.format !== ASSEMBLY_EXPORT_FORMAT) {
    throw new TemplateFileError(
      `It is not an assembly instruction file: its "format" must be "${ASSEMBLY_EXPORT_FORMAT}".`,
    );
  }
  if (header.version !== 1) {
    throw new TemplateFileError(
      'It was made by a newer version of the app, which this one cannot read.',
    );
  }
  const result = AssemblyExportSchema.safeParse(json);
  if (!result.success) {
    const [issue] = result.error.issues;
    const where = issue?.path.length ? ` at ${issue.path.join('.')}` : '';
    throw new TemplateFileError(
      `Something in it is not as it should be${where}${issue ? `: ${issue.message}` : ''}.`,
    );
  }
  return result.data;
}

/** A chosen file, read and checked: the instruction in it, or why it can't be imported. */
export type PickedFile =
  { fileName: string; file: AssemblyExport } | { fileName: string; error: string };

/** Reads and checks the chosen files, each on its own: one bad file doesn't stop the others. */
export function readAssemblyFiles(files: readonly File[]): Promise<PickedFile[]> {
  return Promise.all(
    files.map(async (picked): Promise<PickedFile> => {
      try {
        if (picked.size > MAX_ASSEMBLY_FILE_BYTES) {
          throw new TemplateFileError('It is too big to be an assembly instruction file.');
        }
        return { fileName: picked.name, file: parseAssemblyFile(await picked.text()) };
      } catch (error) {
        return {
          fileName: picked.name,
          error: error instanceof TemplateFileError ? error.message : 'It could not be read.',
        };
      }
    }),
  );
}
