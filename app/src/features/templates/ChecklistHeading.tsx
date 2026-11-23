import { formatHours, formatMinutes, totalHours, totalMinutes, type Section } from '@modig/shared';

/**
 * "Checklist" with its size, above the document in the editor and the read-only views; a quality
 * check's with its time too ("2 sections · 7 rows · 0.8 h").
 */
export function ChecklistHeading({
  id,
  sections,
  withTime = false,
  assembly = false,
}: {
  id: string;
  sections: Section[];
  withTime?: boolean;
  /** An assembly instruction: "Tasks", with "12 tasks · 361 steps · 598 h 14 min". */
  assembly?: boolean;
}) {
  const rows = sections.reduce((sum, section) => sum + section.items.length, 0);
  if (assembly) {
    return (
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 id={id} className="text-base font-semibold text-ink-900">
          Tasks
        </h2>
        <p className="text-sm text-ink-500 tabular-nums">
          {plural(sections.length, 'task')} · {plural(rows, 'step')} ·{' '}
          {formatMinutes(totalMinutes(sections))}
        </p>
      </div>
    );
  }
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h2 id={id} className="text-base font-semibold text-ink-900">
        Checklist
      </h2>
      <p className="text-sm text-ink-500">
        {plural(sections.length, 'section')} · {plural(rows, 'row')}
        {withTime && ` · ${formatHours(totalHours(sections))}`}
      </p>
    </div>
  );
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}
