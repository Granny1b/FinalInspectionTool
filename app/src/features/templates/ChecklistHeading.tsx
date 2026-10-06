import type { Section } from '@modig/shared';

/** "Checklist" with its size, above the document in the editor and the read-only views. */
export function ChecklistHeading({ id, sections }: { id: string; sections: Section[] }) {
  const rows = sections.reduce((sum, section) => sum + section.items.length, 0);
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h2 id={id} className="text-base font-semibold text-ink-900">
        Checklist
      </h2>
      <p className="text-sm text-ink-500">
        {plural(sections.length, 'section')} · {plural(rows, 'row')}
      </p>
    </div>
  );
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}
