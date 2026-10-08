import type { TextDraft } from './editorState';
import type { Size } from './geometry';

/** Labels are short; the schema allows more, this keeps one line on the photo. */
const LABEL_MAX_LENGTH = 200;

type Props = {
  draft: TextDraft;
  shown: Size;
  onChange: (value: string) => void;
  /** Leaving the field keeps what was typed. */
  onCommit: () => void;
  /** Enter (commit) or Escape (discard the change). */
  onDone: (commit: boolean) => void;
};

/**
 * A label being typed, as a text field over the photo where the label will be drawn, in its
 * colour and size. Escape here ends the label only, not the editor.
 */
export function TextLabelInput({ draft, shown, onChange, onCommit, onDone }: Props) {
  return (
    <input
      // Placed by a click (or a double-click on a label): typing starts right there.
      autoFocus
      aria-label="Label text"
      value={draft.value}
      maxLength={LABEL_MAX_LENGTH}
      spellCheck={false}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onCommit}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onDone(event.key === 'Enter');
      }}
      style={{
        left: draft.at.x * shown.width,
        top: draft.at.y * shown.height,
        fontSize: draft.size * shown.height,
        color: draft.color,
      }}
      className="absolute m-0 [field-sizing:content] min-w-[4ch] rounded-xs border-0 bg-ink-950/25 p-0 leading-[1.1] font-bold outline-2 outline-offset-4 outline-white/90 outline-dashed [text-shadow:0_0_3px_rgb(0_0_0/0.9)]"
    />
  );
}
