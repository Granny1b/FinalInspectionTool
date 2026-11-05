import { MAX_REFERENCES } from '@modig/shared';
import { X } from 'lucide-react';
import { useRef, useState } from 'react';
import { addReferences, splitReferences } from './references';

type Props = {
  /** "1.a" */
  rowRef: string;
  references: string[];
  onChange: (references: string[]) => void;
};

/**
 * A row's references (standards and documents, such as "ISO 12100") as small chips with an input
 * after them: `Enter`, a comma or a semicolon adds what was typed, a pasted list is split, and
 * leaving the field adds a reference typed but not yet added. Each chip's × removes it.
 */
export function ReferencesField({ rowRef, references, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const full = references.length >= MAX_REFERENCES;

  function add(parts: string[]) {
    const next = addReferences(references, parts);
    if (next !== references) onChange(next);
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1 px-2">
      {references.length > 0 && (
        <ul aria-label={`References of row ${rowRef}`} className="flex max-w-full flex-wrap gap-1">
          {references.map((reference) => (
            <li
              key={reference}
              className="inline-flex h-6 max-w-full items-center gap-0.5 rounded-sm bg-ink-100 pr-0.5 pl-1.5 text-xs text-ink-700 ring-1 ring-ink-200 ring-inset"
            >
              <span className="truncate">{reference}</span>
              <button
                type="button"
                aria-label={`Remove ${reference} from row ${rowRef}`}
                title={`Remove ${reference}`}
                onClick={() => {
                  onChange(references.filter((other) => other !== reference));
                  inputRef.current?.focus();
                }}
                // A 20 px circle with a larger hit area, as the participants' chips.
                className="relative flex size-5 shrink-0 items-center justify-center rounded-sm text-ink-500 transition-colors after:absolute after:-inset-1 hover:bg-ink-200 hover:text-ink-900 pointer-coarse:after:-inset-2"
              >
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={inputRef}
        aria-label={`Add a reference to row ${rowRef}`}
        autoComplete="off"
        enterKeyHint="done"
        disabled={full}
        maxLength={1000}
        placeholder={
          full ? 'No more references' : references.length > 0 ? 'Add another' : 'Add references'
        }
        value={text}
        onChange={(event) => {
          // A comma, semicolon or line break (typed or pasted) ends a reference.
          const parts = event.target.value.split(/[,;\r\n]/);
          const rest = parts.pop() ?? '';
          if (parts.length > 0) add(splitReferences(parts.join(',')));
          setText(rest);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
          // Enter adds the reference; it never adds a row from here.
          event.preventDefault();
          add(splitReferences(text));
          setText('');
        }}
        onBlur={() => {
          if (!text.trim()) return;
          add(splitReferences(text));
          setText('');
        }}
        className="h-7 min-w-28 flex-1 rounded-sm bg-transparent px-1 text-xs text-ink-900 placeholder:text-ink-500 hover:bg-ink-50 focus:bg-surface focus-visible:outline-1 disabled:hidden"
      />
    </div>
  );
}
