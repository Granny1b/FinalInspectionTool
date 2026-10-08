import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { parseWorkbook, type ParsedWorkbook } from '../lib/parse-workbook';

export const REAL_WORKBOOK_FILE = 'Final_Inspection_rev_2.xlsm';
const REAL_WORKBOOK = fileURLToPath(new URL(`../${REAL_WORKBOOK_FILE}`, import.meta.url));

/** Parses the workbook the quality department actually uses (fresh ids on every call). */
export async function parseRealWorkbook(): Promise<ParsedWorkbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(REAL_WORKBOOK);
  return parseWorkbook(workbook);
}
