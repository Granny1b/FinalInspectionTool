import type { InspectionKind } from '@modig/shared';
import {
  filterToParams as logFilterToParams,
  LOG_PATHS,
  type LogFilter,
} from '../deviationLog/model';
import { LIST_PATHS } from '../inspections/listFilter';
import type { LogPrintLayout } from './log/model';
import { DEVIATIONS_PER_PAGE, PRINT_MODES, type DeviationsPerPage, type PrintMode } from './model';
import { QUALITY_PRINT_MODES, type QualityPrintMode } from './quality/model';

/** `/inspections/:id/print?mode=…`; `autoprint` opens the print dialog once it has loaded. */
export function inspectionPrintHref(id: string, mode: PrintMode, autoprint = false): string {
  const query = new URLSearchParams({ mode });
  if (autoprint) query.set('autoprint', '1');
  return `/inspections/${encodeURIComponent(id)}/print?${query.toString()}`;
}

/**
 * `/quality-checks/:id/print?mode=report|deviations[&deviationsPerPage=2|4]`; `autoprint` opens
 * the print dialog once it has loaded. Without a layout, the print route picks it as for a report.
 */
export function qualityCheckPrintHref(
  id: string,
  { mode, deviationsPerPage }: { mode: QualityPrintMode; deviationsPerPage?: DeviationsPerPage },
  autoprint = false,
): string {
  const query = new URLSearchParams({ mode });
  if (deviationsPerPage) query.set('deviationsPerPage', String(deviationsPerPage));
  if (autoprint) query.set('autoprint', '1');
  return `${printPath('quality', id)}?${query.toString()}`;
}

/** Each kind's print address, without a query: where the other kind's address sends it. */
export function printPath(kind: InspectionKind, id: string): string {
  return `${LIST_PATHS[kind]}/${encodeURIComponent(id)}/print`;
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

/** A quality check's `mode` query parameter, if it names one of its modes. */
export function parseQualityMode(value: string | null): QualityPrintMode | null {
  return QUALITY_PRINT_MODES.find((mode) => mode === value) ?? null;
}

/** The `deviationsPerPage` query parameter, if it is one of the layouts ("2" or "4"). */
export function parseDeviationsPerPage(value: string | null): DeviationsPerPage | null {
  return DEVIATIONS_PER_PAGE.find((perPage) => String(perPage) === value) ?? null;
}

/** The `appendix` query parameter: "1" includes the reference images. */
export function parseAppendix(value: string | null): boolean {
  return value === '1';
}

/**
 * The deviation log's printout under the log page's filters (their address, as the page keeps
 * them), in `layout`; `autoprint` opens the print dialog once it has loaded.
 */
export function deviationLogPrintHref(
  kind: InspectionKind,
  filter: LogFilter,
  { layout, deviationsPerPage }: { layout: LogPrintLayout; deviationsPerPage?: DeviationsPerPage },
  autoprint = false,
): string {
  const query = logFilterToParams(filter);
  query.set('layout', layout);
  if (deviationsPerPage) query.set('deviationsPerPage', String(deviationsPerPage));
  if (autoprint) query.set('autoprint', '1');
  return `${LOG_PATHS[kind]}/print?${query.toString()}`;
}
