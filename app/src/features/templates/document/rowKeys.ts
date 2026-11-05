/** Keyboard helpers shared by the checklist's rows (a final inspection's and a quality check's). */

/**
 * A held Backspace deletes one row only. Its auto-repeats would go on to eat the field that gets
 * focus next (the end of the previous row, then that row too), so they are ignored until the key
 * is released. Listening on the window also covers a section title getting the focus.
 */
export function swallowHeldBackspace() {
  const swallow = (event: globalThis.KeyboardEvent) => {
    if (event.key === 'Backspace' && event.repeat) event.preventDefault();
  };
  const stop = (event: globalThis.KeyboardEvent) => {
    if (event.key !== 'Backspace') return;
    window.removeEventListener('keydown', swallow, true);
    window.removeEventListener('keyup', stop, true);
  };
  window.addEventListener('keydown', swallow, true);
  window.addEventListener('keyup', stop, true);
}

/**
 * ArrowUp/ArrowDown leave the row only from its first/last visual line (in a wrapped row, the
 * browser moves the caret between lines first). The caret's line is measured on an off-screen copy
 * that wraps exactly like the textarea: same width, padding and font.
 */
export function caretAtEdge(textarea: HTMLTextAreaElement, edge: 'first' | 'last'): boolean {
  const { selectionStart, selectionEnd, value } = textarea;
  if (selectionStart !== selectionEnd) return false;
  const style = getComputedStyle(textarea);
  const mirror = document.createElement('div');
  Object.assign(mirror.style, {
    position: 'absolute',
    visibility: 'hidden',
    boxSizing: 'border-box',
    width: `${textarea.clientWidth}px`,
    padding: style.padding,
    font: style.font,
    letterSpacing: style.letterSpacing,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
  });
  // Text before the caret, then the rest in a marker whose top is the caret's line.
  const marker = document.createElement('span');
  marker.textContent = value.slice(selectionStart) || ' ';
  mirror.append(value.slice(0, selectionStart), marker);
  document.body.append(mirror);
  const lineHeight = parseFloat(style.lineHeight);
  const paddingTop = parseFloat(style.paddingTop);
  const caretLine = Math.round((marker.offsetTop - paddingTop) / lineHeight);
  const lines = Math.round(
    (mirror.clientHeight - paddingTop - parseFloat(style.paddingBottom)) / lineHeight,
  );
  mirror.remove();
  return edge === 'first' ? caretLine <= 0 : caretLine >= lines - 1;
}
