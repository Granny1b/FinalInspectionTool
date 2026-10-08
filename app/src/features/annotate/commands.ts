/** The editor's keyboard shortcuts. Escape (cancel) is handled by the editor itself. */
export type EditorCommand = 'undo' | 'redo' | 'delete';

type KeyLike = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>;

/**
 * Ctrl+Z undo, Ctrl+Shift+Z or Ctrl+Y redo (⌘ on a Mac), Delete or Backspace removes the selected
 * mark. With Alt held nothing matches: Ctrl+Alt is AltGr on Swedish keyboards (@, {, [ …).
 */
export function editorCommand(event: KeyLike): EditorCommand | null {
  if (event.altKey) return null;
  const modifier = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (modifier && key === 'z') return event.shiftKey ? 'redo' : 'undo';
  if (modifier && key === 'y' && !event.shiftKey) return 'redo';
  if (!modifier && (event.key === 'Delete' || event.key === 'Backspace')) return 'delete';
  return null;
}
