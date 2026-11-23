/**
 * Turns an assembly workbook (the "HHV assembly" Excel sheet) into an assembly instruction file,
 * to be imported with Import JSON on the Assembly page. It writes a file and touches no storage.
 *
 *   npm run assembly:convert -- HHV_assembly.xlsx
 *   npm run assembly:convert -- HHV_assembly.xlsx out.json --model HHV3 --model-name "HHV 3"
 *   npm run assembly:convert -- HHV_assembly.xlsx --name "HHV-3 24-Tools scheme" --no-comments
 */
import { writeFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import ExcelJS from 'exceljs';
import {
  AssemblyExportSchema,
  assemblyFileSections,
  formatMinutes,
  totalMinutes,
} from '@modig/shared';
import { parseAssemblyWorkbook } from './lib/parse-assembly-workbook';

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      name: { type: 'string' },
      model: { type: 'string' },
      'model-name': { type: 'string' },
      'no-comments': { type: 'boolean', default: false },
    },
  });
  const [workbookArg, outArg] = positionals;
  if (!workbookArg || positionals.length > 2) {
    throw new Error('Usage: assembly:convert <workbook.xlsx> [out.json] [--name …] [--model …]');
  }
  // npm -w runs scripts inside seed/, so resolve paths against where npm was invoked.
  const from = (path: string) => resolve(process.env.INIT_CWD ?? process.cwd(), path);
  const workbookPath = from(workbookArg);
  const outPath = from(outArg ?? `${basename(workbookArg, extname(workbookArg))}.json`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);
  const parsed = parseAssemblyWorkbook(workbook, {
    name: values.name,
    modelCode: values.model,
    modelName: values['model-name'],
    skipComments: values['no-comments'],
  });
  // Through the schema and the import's own conversion, so the file is known to import.
  const file = AssemblyExportSchema.parse(parsed.file);
  const sections = assemblyFileSections(file);
  await writeFile(outPath, `${JSON.stringify(parsed.file, null, 2)}\n`);

  console.log(`“${file.instruction.name}”`);
  console.log(
    `  ${parsed.tasks} tasks, ${parsed.steps} steps, ${formatMinutes(totalMinutes(sections))} estimated`,
  );
  console.log(`  ${parsed.boltLists} steps with a bolt list, ${parsed.documents} documents`);
  for (const warning of parsed.warnings) console.log(`  ! ${warning}`);
  console.log(`Written to ${outPath}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
