/**
 * Search and filters of the inspections list (brief §5.1), and of the quality checks list, which
 * works the same way. They live in the URL (?q=&model=&state=), so coming back from an inspection
 * keeps them, and a filtered list can be shared as a link.
 */
import {
  InspectionStateSchema,
  type InspectionKind,
  type InspectionState,
  type InspectionSummary,
} from '@modig/shared';

/** Each kind's list: final inspections, and the quality checks done on machines. */
export const LIST_PATHS: Record<InspectionKind, string> = {
  final: '/inspections',
  quality: '/quality-checks',
};

/** One inspection's page, or one quality check's. */
export function inspectionHref(kind: InspectionKind, id: string): string {
  return `${LIST_PATHS[kind]}/${id}`;
}

export type InspectionFilter = {
  /**
   * Words that must all appear in the number, machine name or serial number (a quality check's
   * title instead of the machine name).
   */
  query: string;
  /** Model code, or '' for every model. */
  model: string;
  state: InspectionState | '';
};

export function filterFromParams(params: URLSearchParams): InspectionFilter {
  const state = InspectionStateSchema.safeParse(params.get('state'));
  return {
    query: params.get('q') ?? '',
    model: params.get('model') ?? '',
    state: state.success ? state.data : '',
  };
}

/** Only the filters in use, so an unfiltered list has a clean URL. */
export function filterToParams({ query, model, state }: InspectionFilter): URLSearchParams {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (model) params.set('model', model);
  if (state) params.set('state', state);
  return params;
}

/** Each list remembers its own search. */
const LIST_SEARCH_KEYS: Record<InspectionKind, string> = {
  final: 'inspections.listSearch',
  quality: 'qualityChecks.listSearch',
};

/**
 * Remembers the list's search and filters for this tab (`filterToParams(…).toString()`), so the
 * pages' own links back to the list return to them, as the browser's Back does.
 */
export function rememberListSearch(search: string, kind: InspectionKind = 'final'): void {
  try {
    sessionStorage.setItem(LIST_SEARCH_KEYS[kind], search);
  } catch {
    // Storage blocked: the links go to the unfiltered list.
  }
}

/**
 * The list as last shown in this tab: `/inspections` (or `/quality-checks`), with its search and
 * filters if any.
 */
export function inspectionsListHref(kind: InspectionKind = 'final'): string {
  let search: string | null = null;
  try {
    search = sessionStorage.getItem(LIST_SEARCH_KEYS[kind]);
  } catch {
    // Storage blocked.
  }
  return search ? `${LIST_PATHS[kind]}?${search}` : LIST_PATHS[kind];
}

/**
 * Router state for the inspections (or quality checks) list: an admin just deleted the one with
 * this number.
 */
export type InspectionsPageState = { deleted?: string };

export function isFiltered({ query, model, state }: InspectionFilter): boolean {
  return Boolean(query.trim() || model || state);
}

const lower = (text: string) => text.toLocaleLowerCase('sv');

/**
 * The inspections that match, in the order given (the API's: newest first). Search is
 * case-insensitive; "rigimill 1042" finds machine "RigiMill MG" with serial "1042-7", and "pre
 * 016" a quality check "Quality check – Pre start up" of serial "RM-016".
 */
export function filterInspections(
  inspections: readonly InspectionSummary[],
  { query, model, state }: InspectionFilter,
): InspectionSummary[] {
  const words = lower(query).split(/\s+/).filter(Boolean);
  return inspections.filter((inspection) => {
    if (model && inspection.modelCode !== model) return false;
    if (state && inspection.state !== state) return false;
    // A quality check has no machine name; its title says which check it is.
    const name = inspection.kind === 'quality' ? inspection.templateName : inspection.machineName;
    const haystack = lower(`${inspection.number} ${name} ${inspection.serialNumber}`);
    return words.every((word) => haystack.includes(word));
  });
}
