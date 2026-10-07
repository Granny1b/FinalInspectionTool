/**
 * Keyboard-first transcription (brief §5.3): which key does what on a focused row, and in the
 * fields inside it. Pure, so the mapping is unit-tested without a browser.
 */
import type { Status } from '@modig/shared';

/** The parts of a keyboard event the mapping looks at. */
export type KeyPress = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  /** Auto-repeat of a held key. */
  repeat: boolean;
};

export type Move = 'next' | 'previous' | 'first' | 'last';

/** What a key pressed on a focused row asks for. */
export type RowCommand =
  | { kind: 'status'; status: Status }
  | { kind: 'clear' }
  | { kind: 'move'; to: Move }
  | { kind: 'comment' }
  | { kind: 'guide' };

/** Keys that type a character; matched case-insensitively, so Caps Lock and Shift don't matter. */
const CHARACTER_KEYS: Record<string, RowCommand> = {
  '1': { kind: 'status', status: 'OK' },
  o: { kind: 'status', status: 'OK' },
  '2': { kind: 'status', status: 'NOK' },
  n: { kind: 'status', status: 'NOK' },
  '3': { kind: 'status', status: 'NA' },
  a: { kind: 'status', status: 'NA' },
  '0': { kind: 'clear' },
  j: { kind: 'move', to: 'next' },
  k: { kind: 'move', to: 'previous' },
  c: { kind: 'comment' },
  g: { kind: 'guide' },
};

/** Keys without a character; with Shift they are left to the browser (e.g. selecting text). */
const NAMED_KEYS: Record<string, RowCommand> = {
  ArrowDown: { kind: 'move', to: 'next' },
  ArrowUp: { kind: 'move', to: 'previous' },
  Home: { kind: 'move', to: 'first' },
  End: { kind: 'move', to: 'last' },
  Backspace: { kind: 'clear' },
  Delete: { kind: 'clear' },
};

/**
 * The command for a key pressed while a row itself has the focus (not a field inside it), or null
 * to leave the key to the browser.
 *
 * - Ctrl, Alt and Meta combinations are always the browser's (copy, find, AltGr characters…).
 * - Shift still counts for character keys: on some layouts the digits need it.
 * - A held key repeats moves only. Setting or clearing a status takes one press per row, so a key
 *   held a little too long never marks a run of rows.
 */
export function rowCommand(press: KeyPress): RowCommand | null {
  if (press.ctrlKey || press.metaKey || press.altKey) return null;
  const command =
    press.key.length === 1
      ? CHARACTER_KEYS[press.key.toLowerCase()]
      : press.shiftKey
        ? undefined
        : NAMED_KEYS[press.key];
  if (!command) return null;
  if (press.repeat && command.kind !== 'move') return null;
  return command;
}

/** Fields inside a row: comment, resp and (NOK rows) severity. */
export type RowField = 'comment' | 'resp' | 'severity';

/**
 * Keys handled inside a row's fields, or null for the field's own behaviour:
 * - Escape returns the focus to the row, ready for the next status key.
 * - Enter in comment or resp finishes the row and moves to the next one. A select keeps Enter.
 */
export function fieldCommand(press: KeyPress, field: RowField): 'row' | 'next-row' | null {
  if (press.ctrlKey || press.metaKey || press.altKey || press.shiftKey) return null;
  if (press.key === 'Escape') return 'row';
  if (press.key === 'Enter' && field !== 'severity' && !press.repeat) return 'next-row';
  return null;
}
