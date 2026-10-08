/**
 * Search and filters of the inspections list (brief §5.1). They live in the URL (?q=&model=&state=),
 * so coming back from an inspection keeps them, and a filtered list can be shared as a link.
 */
import { InspectionStateSchema, type InspectionState, type InspectionSummary } from '@modig/shared';

export type InspectionFilter = {
  /** Words that must all appear in the number, machine name or serial number. */
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

const LIST_SEARCH_KEY = 'inspections.listSearch';

/**
 * Remembers the list's search and filters for this tab (`filterToParams(…).toString()`), so the
 * pages' own links back to the list return to them, as the browser's Back does.
 */
export function rememberListSearch(search: string): void {
  try {
    sessionStorage.setItem(LIST_SEARCH_KEY, search);
  } catch {
    // Storage blocked: the links go to the unfiltered list.
  }
}

/** The list as last shown in this tab: `/inspections`, with its search and filters if any. */
export function inspectionsListHref(): string {
  let search: string | null = null;
  try {
    search = sessionStorage.getItem(LIST_SEARCH_KEY);
  } catch {
    // Storage blocked.
  }
  return search ? `/inspections?${search}` : '/inspections';
}

export function isFiltered({ query, model, state }: InspectionFilter): boolean {
  return Boolean(query.trim() || model || state);
}

const lower = (text: string) => text.toLocaleLowerCase('sv');

/**
 * The inspections that match, in the order given (the API's: newest first). Search is
 * case-insensitive; "rigimill 1042" finds machine "RigiMill MG" with serial "1042-7".
 */
export function filterInspections(
  inspections: readonly InspectionSummary[],
  { query, model, state }: InspectionFilter,
): InspectionSummary[] {
  const words = lower(query).split(/\s+/).filter(Boolean);
  return inspections.filter((inspection) => {
    if (model && inspection.modelCode !== model) return false;
    if (state && inspection.state !== state) return false;
    const haystack = lower(
      `${inspection.number} ${inspection.machineName} ${inspection.serialNumber}`,
    );
    return words.every((word) => haystack.includes(word));
  });
}
