import { DEVIATIONS_PER_PAGE, PRINT_MODES, type DeviationsPerPage, type PrintMode } from './model';

/** `/inspections/:id/print?mode=…`; `autoprint` opens the print dialog once it has loaded. */
export function inspectionPrintHref(id: string, mode: PrintMode, autoprint = false): string {
  const query = new URLSearchParams({ mode });
  if (autoprint) query.set('autoprint', '1');
  return `/inspections/${encodeURIComponent(id)}/print?${query.toString()}`;
}

/** `/templates/:id/print`: the draft for admins, the latest revision for inspectors; or revision n. */
export function templatePrintHref(id: string, revision?: number): string {
  const path = `/templates/${encodeURIComponent(id)}/print`;
  return revision === undefined ? path : `${path}?revision=${revision}`;
}

/** The `mode` query parameter, if it names a mode. */
export function parseMode(value: string | null): PrintMode | null {
  return PRINT_MODES.find((mode) => mode === value) ?? null;
}

/** The `deviationsPerPage` query parameter, if it is one of the layouts ("2" or "4"). */
export function parseDeviationsPerPage(value: string | null): DeviationsPerPage | null {
  return DEVIATIONS_PER_PAGE.find((perPage) => String(perPage) === value) ?? null;
}

/** The `appendix` query parameter: "1" includes the reference images. */
export function parseAppendix(value: string | null): boolean {
  return value === '1';
}
