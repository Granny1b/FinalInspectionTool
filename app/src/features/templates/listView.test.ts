import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadTemplateView, saveTemplateView } from './listView';

afterEach(() => vi.unstubAllGlobals());

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

describe('the templates view', () => {
  it('is the list until cards are chosen, and stays as chosen', () => {
    vi.stubGlobal('localStorage', memoryStorage());
    expect(loadTemplateView()).toBe('list');
    saveTemplateView('cards');
    expect(loadTemplateView()).toBe('cards');
    saveTemplateView('list');
    expect(loadTemplateView()).toBe('list');
  });

  it('ignores a stored value it does not know', () => {
    const storage = memoryStorage();
    storage.setItem('templates.view', 'grid');
    vi.stubGlobal('localStorage', storage);
    expect(loadTemplateView()).toBe('list');
  });

  it('is the list when storage is blocked, and saving does not throw', () => {
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked });
    expect(loadTemplateView()).toBe('list');
    expect(() => saveTemplateView('cards')).not.toThrow();
  });
});
