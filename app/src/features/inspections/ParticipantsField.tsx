import { X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { ControlProps } from '../../components/Field';
import { addNames, MAX_NAME_LENGTH, splitNames } from './participants';

type Props = {
  control: ControlProps;
  value: string[];
  onChange: (names: string[]) => void;
};

/**
 * Participants as removable chips. `Enter` (or a comma) adds what was typed; a pasted list is
 * split into names; leaving the field adds a name that was typed but not yet added.
 */
export function ParticipantsField({ control, value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');

  function add(names: string[]) {
    const next = addNames(value, names);
    if (next !== value) onChange(next);
  }

  return (
    <div className="flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-ink-500/80 bg-surface px-2 py-0.5 shadow-xs transition-colors hover:border-ink-600 has-[input:focus-visible]:border-brand-600 has-[input:focus-visible]:outline-1 has-[input:focus-visible]:outline-brand-600">
      {value.length > 0 && (
        <ul aria-label="Added participants" className="flex max-w-full flex-wrap gap-1.5">
          {value.map((name) => (
            <li
              key={name}
              className="inline-flex h-6 max-w-full items-center gap-0.5 rounded-full bg-ink-100 pr-0.5 pl-2.5 text-xs font-medium text-ink-800 ring-1 ring-ink-200 ring-inset"
            >
              <span className="truncate">{name}</span>
              <button
                type="button"
                aria-label={`Remove ${name}`}
                onClick={() => {
                  onChange(value.filter((other) => other !== name));
                  inputRef.current?.focus();
                }}
                className="flex size-5 shrink-0 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-ink-200 hover:text-ink-900"
              >
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        {...control}
        ref={inputRef}
        autoComplete="off"
        enterKeyHint="done"
        maxLength={MAX_NAME_LENGTH * 10}
        placeholder={value.length > 0 ? 'Add another' : 'Type a name and press Enter'}
        value={text}
        onChange={(event) => {
          // A comma, semicolon or line break (typed or pasted) ends a name.
          const parts = event.target.value.split(/[,;\r\n]/);
          const rest = parts.pop() ?? '';
          if (parts.length > 0) add(splitNames(parts.join(',')));
          setText(rest);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
          // Never submits the form: Enter adds the name.
          event.preventDefault();
          add(splitNames(text));
          setText('');
        }}
        onBlur={() => {
          if (!text.trim()) return;
          add(splitNames(text));
          setText('');
        }}
        className="h-7 min-w-40 flex-1 bg-transparent px-1 text-sm text-ink-900 placeholder:text-ink-500 focus-visible:outline-none"
      />
    </div>
  );
}
