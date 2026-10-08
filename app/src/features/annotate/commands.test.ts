import { describe, expect, it } from 'vitest';
import { editorCommand } from './commands';

const key = (
  key: string,
  modifiers: Partial<Record<'ctrl' | 'meta' | 'shift' | 'alt', true>> = {},
) => ({
  key,
  ctrlKey: modifiers.ctrl ?? false,
  metaKey: modifiers.meta ?? false,
  shiftKey: modifiers.shift ?? false,
  altKey: modifiers.alt ?? false,
});

describe('editorCommand', () => {
  it('undoes with Ctrl+Z and ⌘Z', () => {
    expect(editorCommand(key('z', { ctrl: true }))).toBe('undo');
    expect(editorCommand(key('z', { meta: true }))).toBe('undo');
  });

  it('redoes with Ctrl+Shift+Z (the key reads "Z" then) and Ctrl+Y', () => {
    expect(editorCommand(key('Z', { ctrl: true, shift: true }))).toBe('redo');
    expect(editorCommand(key('Z', { meta: true, shift: true }))).toBe('redo');
    expect(editorCommand(key('y', { ctrl: true }))).toBe('redo');
  });

  it('works with Caps Lock on', () => {
    expect(editorCommand(key('Z', { ctrl: true }))).toBe('undo');
    expect(editorCommand(key('Y', { ctrl: true }))).toBe('redo');
  });

  it('deletes the selected mark with Delete or Backspace', () => {
    expect(editorCommand(key('Delete'))).toBe('delete');
    expect(editorCommand(key('Backspace'))).toBe('delete');
  });

  it('ignores everything else', () => {
    expect(editorCommand(key('z'))).toBeNull();
    expect(editorCommand(key('y', { ctrl: true, shift: true }))).toBeNull();
    expect(editorCommand(key('Delete', { ctrl: true }))).toBeNull();
    expect(editorCommand(key('s', { ctrl: true }))).toBeNull();
    expect(editorCommand(key('Escape'))).toBeNull();
  });

  it('leaves AltGr (Ctrl+Alt) combinations to the keyboard layout', () => {
    expect(editorCommand(key('z', { ctrl: true, alt: true }))).toBeNull();
    expect(editorCommand(key('Delete', { alt: true }))).toBeNull();
  });
});
