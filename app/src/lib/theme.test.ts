import { describe, expect, it } from 'vitest';
import {
  applyThemeChoice,
  parseThemeChoice,
  readThemeChoice,
  resolveTheme,
  THEME_STORAGE_KEY,
  writeThemeChoice,
} from './theme';

/** A Storage stand-in over a Map (the tests run in Node, without localStorage). */
function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

/** Storage as a blocked or full browser has it: every call throws. */
const throwing = {
  getItem: () => {
    throw new DOMException('Blocked', 'SecurityError');
  },
  setItem: () => {
    throw new DOMException('Full', 'QuotaExceededError');
  },
  removeItem: () => {
    throw new DOMException('Blocked', 'SecurityError');
  },
};

describe('parseThemeChoice', () => {
  it('keeps light and dark', () => {
    expect(parseThemeChoice('light')).toBe('light');
    expect(parseThemeChoice('dark')).toBe('dark');
  });

  it('follows the system for nothing stored, or anything else', () => {
    for (const value of [null, undefined, '', 'system', 'Dark', ' dark', 'blue', 1, {}]) {
      expect(parseThemeChoice(value)).toBe('system');
    }
  });
});

describe('resolveTheme', () => {
  it('shows an explicit choice whatever the system says', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('follows the system for system', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('readThemeChoice', () => {
  it('reads the stored choice', () => {
    expect(readThemeChoice(memoryStorage({ [THEME_STORAGE_KEY]: 'dark' }))).toBe('dark');
    expect(readThemeChoice(memoryStorage({ [THEME_STORAGE_KEY]: 'nonsense' }))).toBe('system');
    expect(readThemeChoice(memoryStorage())).toBe('system');
  });

  it('follows the system without storage, or when it throws', () => {
    expect(readThemeChoice(null)).toBe('system');
    expect(readThemeChoice(throwing)).toBe('system');
  });
});

describe('writeThemeChoice', () => {
  it('stores light and dark, and removes the key for system', () => {
    const storage = memoryStorage();
    writeThemeChoice(storage, 'dark');
    expect(storage.items.get(THEME_STORAGE_KEY)).toBe('dark');
    writeThemeChoice(storage, 'light');
    expect(storage.items.get(THEME_STORAGE_KEY)).toBe('light');
    writeThemeChoice(storage, 'system');
    expect(storage.items.has(THEME_STORAGE_KEY)).toBe(false);
  });

  it('never throws, with storage blocked, full or missing', () => {
    expect(() => writeThemeChoice(throwing, 'dark')).not.toThrow();
    expect(() => writeThemeChoice(throwing, 'system')).not.toThrow();
    expect(() => writeThemeChoice(null, 'dark')).not.toThrow();
  });
});

describe('applyThemeChoice', () => {
  it('sets data-theme for light and dark and removes it for system', () => {
    const root = { dataset: {} as DOMStringMap };
    applyThemeChoice(root, 'dark');
    expect(root.dataset.theme).toBe('dark');
    applyThemeChoice(root, 'light');
    expect(root.dataset.theme).toBe('light');
    applyThemeChoice(root, 'system');
    expect('theme' in root.dataset).toBe(false);
  });
});
