/**
 * "Continue where you left off": the last things opened on this device, kept in the browser's
 * storage. Per device, not per account: several people may share one sign-in in production, and
 * what one of them had open on their tablet is theirs.
 */
import { useSyncExternalStore } from 'react';

export type RecentKind =
  'machine' | 'machine-assembly' | 'instruction' | 'final' | 'quality' | 'template';

export type Recent = {
  /** The page's address without its hash: one entry per page. */
  path: string;
  kind: RecentKind;
  /** The page's title: "Magellan#1", "HHV-3 24-Tools scheme – Magellan#1". */
  title: string;
  /** Where on the page: the task being read, as its element's id and its name. */
  hash?: string;
  place?: string;
  /** A machine's assembly: the instruction it is a copy of, so a search can lead back to it. */
  templateId?: string;
  /** When it was last open. */
  at: string;
};

const KEY = 'search.recent';
const MAX = 8;
const listeners = new Set<() => void>();
let cache: { raw: string | null; list: Recent[] } | null = null;

function read(): Recent[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    // Private mode: nothing is remembered.
  }
  if (cache && cache.raw === raw) return cache.list;
  let list: Recent[] = [];
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      list = parsed.filter(
        (entry): entry is Recent =>
          typeof entry === 'object' &&
          entry !== null &&
          typeof (entry as Recent).path === 'string' &&
          typeof (entry as Recent).title === 'string',
      );
    }
  } catch {
    // Not ours, or damaged: start afresh.
  }
  cache = { raw, list };
  return list;
}

function write(list: Recent[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    return;
  }
  cache = null;
  listeners.forEach((listener) => listener());
}

/** What was said about a page before it was remembered (its place, known before its title). */
const early = new Map<string, Partial<Recent>>();

/** A page was opened: it goes first; where one was on it before (`hash`, `place`) is kept. */
export function recordRecent(entry: Omit<Recent, 'at' | 'hash' | 'place'>): void {
  const list = read();
  const before = list.find((other) => other.path === entry.path);
  const patch = early.get(entry.path);
  early.delete(entry.path);
  write([
    { ...before, ...patch, ...entry, at: new Date().toISOString() },
    ...list.filter((other) => other.path !== entry.path),
  ]);
}

/** More about a page already remembered: where one is on it, or what it is a copy of. */
export function updateRecent(
  path: string,
  patch: Partial<Pick<Recent, 'hash' | 'place' | 'templateId'>>,
): void {
  const list = read();
  const at = list.findIndex((entry) => entry.path === path);
  const entry = list[at];
  if (!entry) {
    // Not remembered yet (its title is still loading): kept for when it is.
    early.set(path, { ...early.get(path), ...patch });
    return;
  }
  const next = { ...entry, ...patch };
  if (JSON.stringify(next) === JSON.stringify(entry)) return;
  write(list.with(at, next));
}

export function forgetRecent(path: string): void {
  write(read().filter((entry) => entry.path !== path));
}

/** The pages last opened here, the latest first. */
export function useRecents(): Recent[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    () => [],
  );
}

export function recentHref(recent: Pick<Recent, 'path' | 'hash'>): string {
  return `${recent.path}${recent.hash ?? ''}`;
}

/** What kind of page an address is, if it is one worth coming back to. */
export function recentKindOf(pathname: string): RecentKind | null {
  const id = '[A-Za-z0-9]+';
  const patterns: [RegExp, RecentKind][] = [
    [new RegExp(`^/machines/${id}/assembly/${id}$`), 'machine-assembly'],
    [new RegExp(`^/machines/(?!new$)${id}$`), 'machine'],
    [new RegExp(`^/assembly/${id}(/revisions/\\d+)?$`), 'instruction'],
    [new RegExp(`^/inspections/(?!new$)${id}$`), 'final'],
    [new RegExp(`^/quality-checks/(?!new$)${id}$`), 'quality'],
    [new RegExp(`^/templates/${id}(/quality-checks/${id})?$`), 'template'],
  ];
  return patterns.find(([pattern]) => pattern.test(pathname))?.[1] ?? null;
}

export const RECENT_KIND_LABELS: Record<RecentKind, string> = {
  machine: 'Machine',
  'machine-assembly': 'Assembly on a machine',
  instruction: 'Assembly instruction',
  final: 'Final inspection',
  quality: 'Quality check',
  template: 'Template',
};
