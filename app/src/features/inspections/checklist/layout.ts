/**
 * Geometry of the fill-in sheet, shared by section headers, editable rows and read-only rows so
 * everything lines up like the printed table: ref | checkpoint | Comment | Status | Resp.
 *
 * The sheet adapts to its own width (container queries), not the viewport's:
 * - wide (≥ 56rem, a desktop): one line per row, in the print's column order;
 * - narrow (≥ 34rem, a tablet): the checkpoint on its own line, Comment | Status | Resp below;
 * - below that everything stacks.
 * A NOK row's severity goes on the next line, under the status it qualifies. Every cell is placed
 * explicitly, so the DOM order (which is the Tab order) can stay comment → resp → severity.
 * Resp is 10rem wide, so a department such as "El-avdelningen" fits its input unclipped.
 */
export const GRID =
  'grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2 gap-y-1.5 @min-[34rem]:grid-cols-[2.25rem_minmax(0,1fr)_12rem_10rem] @min-[56rem]:grid-cols-[2.25rem_minmax(0,3fr)_minmax(0,2fr)_12rem_10rem]';

export const CELL = {
  ref: 'col-start-1 row-start-1',
  text: 'col-start-2 row-start-1 @min-[34rem]:col-span-3 @min-[56rem]:col-span-1',
  comment: 'col-start-2 @min-[34rem]:row-start-2 @min-[56rem]:col-start-3 @min-[56rem]:row-start-1',
  status:
    'col-start-2 @min-[34rem]:col-start-3 @min-[34rem]:row-start-2 @min-[56rem]:col-start-4 @min-[56rem]:row-start-1',
  resp: 'col-start-2 @min-[34rem]:col-start-4 @min-[34rem]:row-start-2 @min-[56rem]:col-start-5 @min-[56rem]:row-start-1',
  severity:
    'col-start-2 @min-[34rem]:col-start-3 @min-[34rem]:row-start-3 @min-[56rem]:col-start-4 @min-[56rem]:row-start-2',
} as const;

/** Wide sheets only: the column labels of a section header. */
export const WIDE_ONLY = 'hidden @min-[56rem]:block';

/**
 * Controls are 44 px high for fingers (tablet layout, or any touch screen), so a status segment
 * is at least 40 px, and 32 px on a desktop with a mouse, where 90+ rows should stay compact.
 */
export const CONTROL_HEIGHT = 'h-11 @min-[56rem]:pointer-fine:h-8';

/** The white sheet, like the printed page. */
export const SHEET =
  'rounded-lg border border-ink-200 bg-surface px-4 py-5 shadow-xs @min-[34rem]:px-6 @min-[34rem]:py-6 @min-[56rem]:px-8 @min-[56rem]:py-8';

/** Header row of a section: light grey like the print. */
export const SECTION_HEADER = 'items-center border-y border-ink-300 bg-ink-50 py-1.5';

/** One checklist line. */
export const ROW_LINE = 'border-b border-ink-200 py-1.5';

/** Text fields in a row. The border is ink-500 at 80 % (3.4:1), as WCAG 1.4.11 asks of a control. */
export const FIELD =
  'w-full min-w-0 rounded-t-sm border border-transparent border-b-ink-500/80 bg-transparent px-2 text-sm text-ink-900 transition-colors placeholder:text-ink-500 hover:border-b-ink-700 @min-[56rem]:placeholder:text-transparent hover:bg-ink-100/60 focus-visible:rounded-sm focus-visible:border-brand-600 focus-visible:bg-surface focus-visible:outline-1 focus-visible:outline-offset-0';

/** "Row 3.c has no status." (brief §5.3 Finalise): red outline and tint, as in the template editor. */
export const ISSUE_OUTLINE = 'bg-nok-bg outline-1 -outline-offset-1 outline-nok-fg';

/**
 * A focused row: the cyan ring drawn inside the row, so it isn't hidden by its neighbours. It
 * overrides the red issue outline while focused.
 */
export const ROW_FOCUS =
  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600';

/** NOK rows get a red bar down the left edge (brief §5.3). */
export const NOK_BAR = 'before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-nok-fg';
