/** A final inspection template's checklist, a quality check's, or an assembly instruction's tasks. */
export type DocumentVariant = 'final' | 'quality' | 'assembly';

/** What a document calls its sections and rows: an assembly instruction has tasks of steps. */
export function documentWords(variant: DocumentVariant) {
  return variant === 'assembly'
    ? ({ section: 'task', Section: 'Task', row: 'step', Row: 'Step' } as const)
    : ({ section: 'section', Section: 'Section', row: 'row', Row: 'Row' } as const);
}
