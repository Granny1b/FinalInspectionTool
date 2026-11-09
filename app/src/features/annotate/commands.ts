import { historyKey } from '../../lib/history';

/** The editor's keyboard shortcuts. Escape (deselect, then cancel) is handled by the editor. */
export type EditorCommand = 'undo' | 'redo' | 'delete' | 'duplicate';

type KeyLike = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>;

/**
 * Ctrl+Z undo, Ctrl+Shift+Z or Ctrl+Y redo, Ctrl+D duplicates the selected mark (⌘ on a Mac),
 * Delete or Backspace removes it. With Alt held nothing matches: Ctrl+Alt is AltGr on Swedish
 * keyboards (@, {, [ …).
 */
export function editorCommand(event: KeyLike): EditorCommand | null {
  if (event.altKey) return null;
  const step = historyKey(event);
  if (step) return step;
  const modifier = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (modifier && key === 'd' && !event.shiftKey) return 'duplicate';
  if (!modifier && (event.key === 'Delete' || event.key === 'Backspace')) return 'delete';
  return null;
}

/** An arrow key moves the selected mark a screen pixel; with Shift, ten. */
export const NUDGE_PX = 1;
export const NUDGE_LARGE_PX = 10;

const NUDGES: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** How far (screen pixels) an arrow key moves the selected mark, or null for any other key. */
export function nudgeOf(event: KeyLike): { x: number; y: number } | null {
  const direction = NUDGES[event.key];
  if (!direction || event.altKey || event.ctrlKey || event.metaKey) return null;
  const step = event.shiftKey ? NUDGE_LARGE_PX : NUDGE_PX;
  return { x: direction[0] * step, y: direction[1] * step };
}
