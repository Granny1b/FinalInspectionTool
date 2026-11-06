/**
 * The deviation log page's model: its filters, kept in the address (?status=&model=&machine=
 * &resp=&category=&q=; the kind is the page's own, /deviations/final or /deviations/quality), and what
 * it shows from the log under them: the summary and the deviations grouped by machine.
 */
import {
  compareLogEntries,
  isOverdue,
  matchesDeviationLog,
  NOT_SET,
  parseDeviationLogQuery,
  type DeviationLogEntry,
  type DeviationLogQuery,
  type InspectionKind,
  type LogMachine,
  type LogStatus,
} from '@modig/shared';
import { inspectionHref } from '../inspections/listFilter';

/** The log page of each kind. */
export const LOG_PATHS: Record<InspectionKind, string> = {
  final: '/deviations/final',
  quality: '/deviations/quality',
};

/**
 * The inspection's Deviations tab (`?tab=deviations`), at one deviation when its key is given
 * (`&deviation=`).
 */
export function deviationsTabHref(kind: InspectionKind, inspectionId: string, key?: string) {
  const search = new URLSearchParams({ tab: 'deviations' });
  if (key) search.set('deviation', key);
  return `${inspectionHref(kind, inspectionId)}?${search}`;
}

/** What the page's filters hold: the search as typed (the matching trims it). */
export type LogFilter = Omit<DeviationLogQuery, 'q'> & { q: string };

const FILTER_KEYS = ['status', 'model', 'machine', 'resp', 'category'] as const;

/**
 * The filters in the address. One that can't be read (an old or edited link) is left out rather
 * than breaking the page: the rest still apply.
 */
export function filterFromParams(params: URLSearchParams, kind: InspectionKind): LogFilter {
  const filter: LogFilter = { kind, status: 'open', q: params.get('q') ?? '' };
  for (const key of FILTER_KEYS) {
    const value = params.get(key);
    if (!value) continue;
    const parsed = parseDeviationLogQuery({ get: (name) => (name === key ? value : null) });
    if (parsed.success) Object.assign(filter, { [key]: parsed.data[key] });
  }
  return filter;
}

/** Only the filters in use, so the open deviations of every machine have a clean address. */
export function filterToParams(filter: LogFilter): URLSearchParams {
  const params = new URLSearchParams();
  if (filter.status !== 'open') params.set('status', filter.status);
  if (filter.model) params.set('model', filter.model);
  if (filter.machine) params.set('machine', filter.machine);
  if (filter.resp) params.set('resp', filter.resp);
  if (filter.category) params.set('category', filter.category);
  if (filter.q) params.set('q', filter.q);
  return params;
}

/** As the API takes it (the CSV export): the search trimmed, empty filters left out. */
export function queryOf(filter: LogFilter): DeviationLogQuery {
  const { q, ...rest } = filter;
  return q.trim() ? { ...rest, q: q.trim() } : rest;
}

export function isFiltered(filter: LogFilter): boolean {
  return Boolean(
    filter.model || filter.machine || filter.resp || filter.category || filter.q.trim(),
  );
}

// ---------------------------------------------------------------------------------------------
// What the page shows
// ---------------------------------------------------------------------------------------------

export type LogSummary = {
  open: number;
  closed: number;
  /** Open, and found more than OVERDUE_DAYS days ago. */
  overdue: number;
  /** The oldest open deviation's found date, '' when none is open. */
  oldestOpen: string;
  /**
   * Open deviations per responsible, most first ('' for those without one), whatever the
   * responsible filter: the chips that pick one.
   */
  openByResp: { resp: string; open: number }[];
};

/** One machine: its deviations under the filters, and how many of them are open and closed. */
export type LogGroup = {
  key: string;
  /** The machine record, when its inspections are linked to one: the header names it as it is. */
  machineRef?: string;
  machineName: string;
  serialNumber: string;
  modelCode: string;
  /** A quality check's title ('' for a final inspection, and for a machine's quality checks). */
  checkName: string;
  /**
   * The inspections its deviations come from, newest first: usually one. A machine's quality
   * checks each say which check they are.
   */
  inspections: {
    id: string;
    number: string;
    date: string;
    finalised: boolean;
    checkName: string;
  }[];
  /** Under every filter, the status included: the rows shown, oldest inspection first. */
  entries: DeviationLogEntry[];
  /** Under every filter but the status: what its progress counts. */
  open: number;
  closed: number;
};

export type LogView = { summary: LogSummary; groups: LogGroup[]; shown: number };

const folded = (text: string) => text.trim().toLocaleLowerCase('sv');
const BY_TEXT = new Intl.Collator('sv', { numeric: true });

/**
 * The summary and the groups for these filters. The summary and each machine's progress count
 * every deviation under the other filters, open and closed, so "Closed" says something while
 * the open ones are listed. Machines with open deviations come first, then the newest.
 */
export function logView(
  entries: readonly DeviationLogEntry[],
  filter: LogFilter,
  today: string,
  machines: readonly LogMachine[] = [],
): LogView {
  const machineById = new Map(machines.map((machine) => [machine.id, machine]));
  const query = queryOf(filter);
  const scope = entries.filter((entry) => matchesDeviationLog(entry, { ...query, status: 'all' }));
  const shownStatus = (entry: DeviationLogEntry) =>
    filter.status === 'all' || entry.status === filter.status;

  const open = scope.filter((entry) => entry.status === 'open');
  const summary: LogSummary = {
    open: open.length,
    closed: scope.length - open.length,
    overdue: open.filter((entry) => isOverdue(entry, today)).length,
    oldestOpen: open.map((entry) => entry.foundOn).sort()[0] ?? '',
    openByResp: openByResp(
      entries.filter((entry) =>
        matchesDeviationLog(entry, { ...query, status: 'open', resp: undefined }),
      ),
    ),
  };

  const groups = new Map<string, LogGroup>();
  for (const entry of [...scope].sort(compareLogEntries)) {
    const machine = entry.machineRef ? machineById.get(entry.machineRef) : undefined;
    const key = machine ? `machine\n${machine.id}` : groupKey(entry, filter.kind);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        ...(machine && { machineRef: machine.id }),
        machineName: entry.machineName,
        serialNumber: entry.serialNumber,
        modelCode: entry.modelCode,
        // A machine's quality checks are all under it; each inspection says which it is.
        checkName: filter.kind === 'quality' && !machine ? entry.checkName : '',
        inspections: [],
        entries: [],
        open: 0,
        closed: 0,
      };
      groups.set(key, group);
    }
    if (!group.inspections.some((inspection) => inspection.id === entry.inspectionId)) {
      // Oldest first here, so the newest inspection's spelling of the machine wins.
      group.inspections.unshift({
        id: entry.inspectionId,
        number: entry.inspectionNumber,
        date: entry.inspectionDate,
        finalised: entry.finalised,
        checkName: filter.kind === 'quality' && machine ? entry.checkName : '',
      });
      group.machineName = entry.machineName;
      group.serialNumber = entry.serialNumber;
    }
    // A machine is named as it is now, whatever its inspections were done with.
    if (machine) {
      group.machineName = machine.machineName;
      group.serialNumber = machine.serialNumber;
      group.modelCode = machine.modelCode;
    }
    group[entry.status] += 1;
    if (shownStatus(entry)) group.entries.push(entry);
  }

  const shown = [...groups.values()].filter((group) => group.entries.length > 0);
  shown.sort(compareGroups);
  return {
    summary,
    groups: shown,
    shown: shown.reduce((sum, group) => sum + group.entries.length, 0),
  };
}

/**
 * Which machine a deviation belongs to when its inspection is linked to no machine record: its
 * Machine ID and serial number (ignoring case and spaces), of its model; for a quality check also
 * which check, since a machine has several. A linked one is under its machine.
 */
function groupKey(entry: DeviationLogEntry, kind: InspectionKind): string {
  return [
    entry.modelCode,
    folded(entry.machineName),
    folded(entry.serialNumber),
    kind === 'quality' ? folded(entry.checkName) : '',
  ].join('\n');
}

/** Machines with open deviations first; then the newest inspection first. */
function compareGroups(a: LogGroup, b: LogGroup): number {
  const [newestA, newestB] = [a.inspections[0]!, b.inspections[0]!];
  return (
    Number(b.open > 0) - Number(a.open > 0) ||
    newestB.date.localeCompare(newestA.date) ||
    BY_TEXT.compare(newestB.number, newestA.number) ||
    a.key.localeCompare(b.key)
  );
}

/** Responsibles spelt alike (case, spaces) count together, in the spelling most use. */
function openByResp(open: readonly DeviationLogEntry[]): LogSummary['openByResp'] {
  const counts = new Map<string, { spellings: Map<string, number>; open: number }>();
  for (const { resp } of open) {
    const key = folded(resp);
    const count = counts.get(key) ?? { spellings: new Map(), open: 0 };
    count.open += 1;
    count.spellings.set(resp.trim(), (count.spellings.get(resp.trim()) ?? 0) + 1);
    counts.set(key, count);
  }
  return [...counts.values()]
    .map(({ spellings, open: count }) => ({
      resp: [...spellings].sort((a, b) => b[1] - a[1])[0]![0],
      open: count,
    }))
    .sort(
      (a, b) =>
        Number(!a.resp) - Number(!b.resp) || b.open - a.open || BY_TEXT.compare(a.resp, b.resp),
    );
}

/** A responsible chip's or menu entry's filter value: NOT_SET for those without one. */
export function respValue(resp: string): string {
  return resp || NOT_SET;
}

/** The status filter's choices, in order. */
export const STATUS_CHOICES: { status: LogStatus; label: string }[] = [
  { status: 'open', label: 'Open' },
  { status: 'closed', label: 'Closed' },
  { status: 'all', label: 'All' },
];

/** The choices of a list filter (responsible, category): every value in the log, by name. */
export function listChoices(
  entries: readonly DeviationLogEntry[],
  field: 'resp' | 'category',
  current: string | undefined,
): { value: string; label: string }[] {
  const byKey = new Map<string, string>();
  let none = false;
  for (const entry of entries) {
    const value = entry[field].trim();
    if (!value) none = true;
    else if (!byKey.has(folded(value))) byKey.set(folded(value), value);
  }
  // One from a shared link stays selectable even when nothing has it any more.
  if (current && current !== NOT_SET && !byKey.has(folded(current))) {
    byKey.set(folded(current), current);
  }
  const choices = [...byKey.values()]
    .sort((a, b) => BY_TEXT.compare(a, b))
    .map((value) => ({ value, label: value }));
  if (none || current === NOT_SET) {
    choices.push({ value: NOT_SET, label: field === 'resp' ? 'Not assigned' : 'No category' });
  }
  return choices;
}
