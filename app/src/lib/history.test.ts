import { describe, expect, it } from 'vitest';
import {
  amend,
  canRedo,
  canUndo,
  HISTORY_LIMIT,
  historyKey,
  record,
  redo,
  startHistory,
  undo,
  type History,
} from './history';

describe('history', () => {
  it('starts with nothing to undo or redo', () => {
    const history = startHistory('a');
    expect(history).toEqual({ past: [], present: 'a', future: [] });
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
  });

  it('undoes and redoes steps in order', () => {
    let history = record(record(startHistory('a'), 'b'), 'c');
    history = undo(history);
    expect(history.present).toBe('b');
    history = undo(history);
    expect(history.present).toBe('a');
    expect(canUndo(history)).toBe(false);
    history = redo(history);
    expect(history.present).toBe('b');
    history = redo(history);
    expect(history.present).toBe('c');
    expect(canRedo(history)).toBe(false);
  });

  it('drops what could be redone when a new step is recorded', () => {
    let history = undo(record(record(startHistory('a'), 'b'), 'c'));
    history = record(history, 'd');
    expect(history).toEqual({ past: ['a', 'b'], present: 'd', future: [] });
  });

  it('records nothing for the same value', () => {
    const items = ['x'];
    const history = startHistory(items);
    expect(record(history, items)).toBe(history);
  });

  it('does nothing when there is nothing to undo or redo', () => {
    const history = startHistory('a');
    expect(undo(history)).toBe(history);
    expect(redo(history)).toBe(history);
  });

  it('keeps the last HISTORY_LIMIT steps', () => {
    let history: History<number> = startHistory(0);
    for (let step = 1; step <= HISTORY_LIMIT + 20; step++) history = record(history, step);
    expect(history.past).toHaveLength(HISTORY_LIMIT);
    while (canUndo(history)) history = undo(history);
    expect(history.present).toBe(20);
  });

  it('keeps undefined and falsy values as real steps', () => {
    let history = record(startHistory<number | undefined>(0), undefined);
    history = undo(history);
    expect(history.present).toBe(0);
    history = redo(history);
    expect(history.present).toBeUndefined();
    expect(canRedo(history)).toBe(false);
  });
});

describe('amend', () => {
  it('replaces the present without a step, and drops the redo', () => {
    let history = record(startHistory('a'), 'ab');
    history = amend(history, 'abc');
    expect(history).toEqual({ past: ['a'], present: 'abc', future: [] });
    history = amend(undo(history), 'x');
    expect(history).toEqual({ past: [], present: 'x', future: [] });
  });

  it('records nothing for the same value', () => {
    const history = startHistory('a');
    expect(amend(history, 'a')).toBe(history);
  });
});

describe('historyKey', () => {
  const key = (
    k: string,
    mods: Partial<Record<'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey', boolean>> = {},
  ) => ({
    key: k,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...mods,
  });

  it('undoes with Ctrl+Z or ⌘Z and redoes with Ctrl+Shift+Z or Ctrl+Y', () => {
    expect(historyKey(key('z', { ctrlKey: true }))).toBe('undo');
    expect(historyKey(key('Z', { metaKey: true }))).toBe('undo');
    expect(historyKey(key('Z', { ctrlKey: true, shiftKey: true }))).toBe('redo');
    expect(historyKey(key('y', { ctrlKey: true }))).toBe('redo');
  });

  it('leaves everything else, AltGr included, alone', () => {
    expect(historyKey(key('z'))).toBeNull();
    expect(historyKey(key('z', { ctrlKey: true, altKey: true }))).toBeNull();
    expect(historyKey(key('Y', { ctrlKey: true, shiftKey: true }))).toBeNull();
    expect(historyKey(key('s', { ctrlKey: true }))).toBeNull();
  });
});
