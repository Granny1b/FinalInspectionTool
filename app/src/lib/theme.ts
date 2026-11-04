import { useCallback, useSyncExternalStore } from 'react';

/** What a user picks: follow the system's light or dark setting, or always one of them. */
export const THEME_CHOICES = ['system', 'light', 'dark'] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];
export type Theme = 'light' | 'dark';

/**
 * Where the choice is kept, per browser. public/theme.js reads the same key before the first
 * paint (the app bundle comes too late to avoid a flash of the wrong theme): change both.
 */
export const THEME_STORAGE_KEY = 'theme';

/** The system's setting, which 'system' follows. */
const DARK_QUERY = '(prefers-color-scheme: dark)';

/** A stored value as a choice: anything but 'light' or 'dark' (nothing stored too) is 'system'. */
export function parseThemeChoice(value: unknown): ThemeChoice {
  return value === 'light' || value === 'dark' ? value : 'system';
}

/** The theme a choice shows, given whether the system is set to dark. */
export function resolveTheme(choice: ThemeChoice, systemDark: boolean): Theme {
  if (choice === 'system') return systemDark ? 'dark' : 'light';
  return choice;
}

type ReadableStorage = Pick<Storage, 'getItem'>;
type WritableStorage = Pick<Storage, 'setItem' | 'removeItem'>;

/** The stored choice; 'system' when storage is unavailable (blocked, private mode) or throws. */
export function readThemeChoice(storage: ReadableStorage | null): ThemeChoice {
  try {
    return parseThemeChoice(storage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'system';
  }
}

/**
 * Keeps the choice; 'system' removes it, so the system's setting is followed again. Best effort:
 * without storage the choice still applies until the page is reloaded.
 */
export function writeThemeChoice(storage: WritableStorage | null, choice: ThemeChoice): void {
  try {
    if (choice === 'system') storage?.removeItem(THEME_STORAGE_KEY);
    else storage?.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Storage full or blocked: nothing to keep it in.
  }
}

/**
 * `data-theme` on <html>, which index.css reads: set for an explicit choice, absent for 'system'
 * (the CSS then follows `prefers-color-scheme`).
 */
export function applyThemeChoice(root: { dataset: DOMStringMap }, choice: ThemeChoice): void {
  if (choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = choice;
}

/** `localStorage`, or null where reading the property itself throws (blocked site data). */
function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// One store for the page, so the sidebar and the tablet drawer show the same choice.
const listeners = new Set<() => void>();
let current: ThemeChoice | null = null;

function snapshot(): ThemeChoice {
  current ??= readThemeChoice(browserStorage());
  return current;
}

function setChoice(choice: ThemeChoice): void {
  current = choice;
  applyThemeChoice(document.documentElement, choice);
  writeThemeChoice(browserStorage(), choice);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // A choice made in another tab applies here too.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
    current = parseThemeChoice(event.newValue);
    applyThemeChoice(document.documentElement, current);
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** The theme choice and how to change it (applied at once, and kept for the next visit). */
export function useThemeChoice(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const choice = useSyncExternalStore(subscribe, snapshot);
  return [choice, useCallback((next: ThemeChoice) => setChoice(next), [])];
}

function subscribeSystem(listener: () => void): () => void {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

/** Whether the system is set to dark right now (what 'system' shows), kept up to date. */
export function useSystemDark(): boolean {
  return useSyncExternalStore(subscribeSystem, () => window.matchMedia(DARK_QUERY).matches);
}
