/**
 * One-off import of the RigiMill MG checklist and the machine models from the Excel workbook
 * (brief §2). Safe to re-run: it only creates what is missing.
 *
 *   npm run seed -w @modig/seed                          local Azurite (UseDevelopmentStorage=true)
 *   npm run seed -w @modig/seed -- --dry-run             parse, validate and summarise; write nothing
 *   npm run seed -w @modig/seed -- path/to/workbook.xlsm another copy of the workbook
 *
 * STORAGE_CONNECTION_STRING selects another storage account (e.g. the one in Azure).
 */
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import ExcelJS from 'exceljs';
import { blobNames, CONTAINERS, newId, rowRef, STORAGE_CONNECTION_STRING_ENV } from '@modig/shared';
import { buildSettings, buildTemplateDocuments } from './lib/build-documents';
import { parseWorkbook, SHEETS, type ParsedWorkbook } from './lib/parse-workbook';
import {
  connectStorage,
  describeStorage,
  writeSeed,
  type SeedReport,
  type Storage,
} from './lib/write-storage';

const DEFAULT_WORKBOOK = fileURLToPath(new URL('./Final_Inspection_rev_2.xlsm', import.meta.url));
const LOCAL_CONNECTION_STRING = 'UseDevelopmentStorage=true';

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { 'dry-run': { type: 'boolean', default: false } },
  });
  if (positionals.length > 1) throw new Error('Expected at most one workbook path');
  // npm -w runs scripts inside seed/, so resolve a path argument against where npm was invoked.
  const workbookPath = positionals[0]
    ? resolve(process.env.INIT_CWD ?? process.cwd(), positionals[0])
    : DEFAULT_WORKBOOK;
  const sourceFile = basename(workbookPath);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);
  const parsed = parseWorkbook(workbook);
  printSummary(workbookPath, parsed);

  if (values['dry-run']) {
    // Build the documents anyway so a dry run also proves they pass the shared schemas.
    const now = new Date().toISOString();
    buildTemplateDocuments(parsed, { templateId: newId(), sourceFile, now });
    buildSettings(parsed, now);
    console.log('\nDry run: documents are valid; nothing was written.');
    return;
  }

  // `||`, not `??`: an empty variable (common in .env files) also means "use local Azurite".
  const connectionString = process.env[STORAGE_CONNECTION_STRING_ENV] || LOCAL_CONNECTION_STRING;
  const storage = connectStorage(connectionString);
  console.log(`\nStorage     ${describeStorage(storage)}`);
  if (!process.env[STORAGE_CONNECTION_STRING_ENV]) {
    console.log(`            (${STORAGE_CONNECTION_STRING_ENV} not set: using local Azurite)`);
  }
  try {
    printReport(await writeSeed(storage, parsed, { sourceFile }));
  } catch (error) {
    throw explainStorageError(error, storage);
  }
}

function printSummary(workbookPath: string, parsed: ParsedWorkbook): void {
  const itemCount = parsed.sections.reduce((sum, s) => sum + s.items.length, 0);
  console.log(`Workbook    ${workbookPath}`);
  console.log(
    `Checklist   ${SHEETS.checklist}: ${parsed.sections.length} sections, ${itemCount} checkpoints`,
  );
  const titleWidth = Math.max(...parsed.sections.map((s) => s.title.length));
  parsed.sections.forEach((section, index) => {
    const first = section.items[0];
    const firstRow = first ? `${rowRef(index, 0)} ${first.text}` : '';
    console.log(
      `  ${String(index + 1).padStart(2)}  ${section.title.padEnd(titleWidth)}  ${String(section.items.length).padStart(3)} items   first: ${firstRow}`,
    );
  });
  console.log(`Models      ${parsed.models.map((m) => `${m.name} (${m.code})`).join(', ')}`);
  console.log(
    `Revision    ${parsed.publishedRevision} (published), draft ${parsed.publishedRevision + 1}`,
  );
  console.log(`Location    ${parsed.defaultLocation}`);
  for (const warning of parsed.warnings) console.warn(`Warning     ${warning}`);
}

function printReport({ createdContainers, settings, template }: SeedReport): void {
  console.log(
    `Containers  ${createdContainers.length ? `created ${createdContainers.join(', ')}` : 'all present'}`,
  );
  const settingsLine = {
    created: `created with models ${settings.addedModelCodes.join(', ')}`,
    merged: `added missing models ${settings.addedModelCodes.join(', ')}`,
    unchanged: 'unchanged (all models present)',
  }[settings.action];
  console.log(`Settings    ${settingsLine}`);
  const id = template.templateId;
  const draftPath = `${CONTAINERS.templates}/${blobNames.templateDraft(id)}`;
  if (template.action === 'created') {
    const revisionPath = `${CONTAINERS.templates}/${blobNames.templateRevision(id, template.publishedRevision)}`;
    console.log(`Template    created ${revisionPath} (published)`);
    console.log(`            created ${draftPath} (draft, revision ${template.draftRevision})`);
  } else {
    console.log(`Template    already seeded: ${draftPath} exists for this model; left untouched`);
  }
}

/** Turn "connection refused" into what to do about it. */
function explainStorageError(error: unknown, storage: Storage): unknown {
  const refused = error instanceof Error && 'code' in error && error.code === 'ECONNREFUSED';
  if (!refused) return error;
  return new Error(
    `Cannot reach storage (${describeStorage(storage)}). For local development start Azurite first (npm run dev starts it), or set ${STORAGE_CONNECTION_STRING_ENV}.`,
  );
}

main().catch((error: unknown) => {
  console.error(`\nSeed failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
