import { describe, expect, it } from 'vitest';
import { fieldCommand, rowCommand, type KeyPress } from './keys';

function press(key: string, modifiers: Partial<Omit<KeyPress, 'key'>> = {}): KeyPress {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    ...modifiers,
  };
}

describe('rowCommand', () => {
  it.each([
    ['1', 'OK'],
    ['o', 'OK'],
    ['O', 'OK'],
    ['2', 'NOK'],
    ['n', 'NOK'],
    ['N', 'NOK'],
    ['3', 'NA'],
    ['a', 'NA'],
    ['A', 'NA'],
  ] as const)('%s sets %s', (key, status) => {
    expect(rowCommand(press(key))).toEqual({ kind: 'status', status });
  });

  it('accepts Shift with character keys (Caps-free uppercase, layouts where digits need Shift)', () => {
    expect(rowCommand(press('O', { shiftKey: true }))).toEqual({ kind: 'status', status: 'OK' });
    expect(rowCommand(press('2', { shiftKey: true }))).toEqual({ kind: 'status', status: 'NOK' });
  });

  it.each(['0', 'Backspace', 'Delete'])('%s clears the status', (key) => {
    expect(rowCommand(press(key))).toEqual({ kind: 'clear' });
  });

  it.each([
    ['ArrowDown', 'next'],
    ['j', 'next'],
    ['J', 'next'],
    ['ArrowUp', 'previous'],
    ['k', 'previous'],
    ['K', 'previous'],
    ['Home', 'first'],
    ['End', 'last'],
  ] as const)('%s moves to the %s row', (key, to) => {
    expect(rowCommand(press(key))).toEqual({ kind: 'move', to });
  });

  it('C focuses the comment and G opens the guide', () => {
    expect(rowCommand(press('c'))).toEqual({ kind: 'comment' });
    expect(rowCommand(press('C'))).toEqual({ kind: 'comment' });
    expect(rowCommand(press('g'))).toEqual({ kind: 'guide' });
  });

  it.each(['ctrlKey', 'metaKey', 'altKey'] as const)(
    'leaves every key with %s to the browser',
    (modifier) => {
      for (const key of ['1', 'o', 'n', 'a', 'c', 'j', '0', 'ArrowDown', 'Home', 'Backspace']) {
        expect(rowCommand(press(key, { [modifier]: true }))).toBeNull();
      }
    },
  );

  it('leaves Shift with named keys to the browser', () => {
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Backspace', 'Delete']) {
      expect(rowCommand(press(key, { shiftKey: true }))).toBeNull();
    }
  });

  it('ignores a held key except for moves', () => {
    for (const key of ['1', 'n', '3', '0', 'Backspace', 'c', 'g']) {
      expect(rowCommand(press(key, { repeat: true }))).toBeNull();
    }
    expect(rowCommand(press('ArrowDown', { repeat: true }))).toEqual({ kind: 'move', to: 'next' });
    expect(rowCommand(press('k', { repeat: true }))).toEqual({ kind: 'move', to: 'previous' });
  });

  it.each(['4', 'x', 'Tab', 'Enter', ' ', 'Escape', 'ArrowLeft', 'PageDown', 'F5', 'Dead'])(
    'ignores %j',
    (key) => {
      expect(rowCommand(press(key))).toBeNull();
    },
  );
});

describe('fieldCommand', () => {
  it('Escape returns to the row from every field', () => {
    for (const field of ['comment', 'resp', 'severity'] as const) {
      expect(fieldCommand(press('Escape'), field)).toBe('row');
    }
  });

  it('Enter moves on to the next row from comment and resp, not from the severity select', () => {
    expect(fieldCommand(press('Enter'), 'comment')).toBe('next-row');
    expect(fieldCommand(press('Enter'), 'resp')).toBe('next-row');
    expect(fieldCommand(press('Enter'), 'severity')).toBeNull();
  });

  it('leaves modified and held keys, and everything else, to the field', () => {
    expect(fieldCommand(press('Enter', { shiftKey: true }), 'comment')).toBeNull();
    expect(fieldCommand(press('Enter', { ctrlKey: true }), 'resp')).toBeNull();
    expect(fieldCommand(press('Enter', { repeat: true }), 'resp')).toBeNull();
    expect(fieldCommand(press('Escape', { altKey: true }), 'comment')).toBeNull();
    for (const key of ['1', 'n', 'c', 'ArrowDown', 'Tab', 'Backspace']) {
      expect(fieldCommand(press(key), 'comment')).toBeNull();
    }
  });
});
