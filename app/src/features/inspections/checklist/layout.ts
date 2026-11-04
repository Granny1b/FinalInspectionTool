/**
 * Geometry of the fill-in sheet, shared by section headers and editable rows so everything lines
 * up like the printed table: ref | checkpoint | Comment | Status | Responsible. Read-only rows
 * have a grid of their own (READ_GRID, below).
 *
 * The sheet adapts to its own width (container queries), not the viewport's:
 * - wide (≥ 56rem, a desktop): one line per row, in the print's column order;
 * - narrow (≥ 34rem, a tablet): the checkpoint on its own line, Comment | Status | Resp below;
 * - below that (a phone) everything stacks, and the fields take the width of the ref column too:
 *   the checkpoint keeps its letter beside it, the fields line up with the letter under it.
 * A NOK row's severity goes on the next line, under the status it qualifies, with its category
 * before it (under the comment, where a long category has room) and its photo count after it,
 * under Responsible. Every cell is placed explicitly, so the DOM order (which is the Tab order)
 * can stay comment → responsible → category → severity, left to right, top to bottom.
 * Responsible is 10rem wide, so a department such as "El-avdelningen" fits unclipped.
 */
export const GRID =
  'grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2 gap-y-1.5 @min-[34rem]:grid-cols-[2.25rem_minmax(0,1fr)_12rem_10rem] @min-[56rem]:grid-cols-[2.25rem_minmax(0,3fr)_minmax(0,2fr)_12rem_10rem]';

/**
 * A field's cell on a phone: both columns, inset like the ref letter (pl-2), which also keeps it
 * clear of a NOK row's red bar.
 */
const STACKED = 'col-span-2 col-start-1 @max-[34rem]:pl-2 @min-[34rem]:col-span-1';

export const CELL = {
  ref: 'col-start-1 row-start-1',
  text: 'col-start-2 row-start-1 @min-[34rem]:col-span-3 @min-[56rem]:col-span-1',
  comment: `${STACKED} @min-[34rem]:col-start-2 @min-[34rem]:row-start-2 @min-[56rem]:col-start-3 @min-[56rem]:row-start-1`,
  status: `${STACKED} @min-[34rem]:col-start-3 @min-[34rem]:row-start-2 @min-[56rem]:col-start-4 @min-[56rem]:row-start-1`,
  resp: `${STACKED} @min-[34rem]:col-start-4 @min-[34rem]:row-start-2 @min-[56rem]:col-start-5 @min-[56rem]:row-start-1`,
  category: `${STACKED} @min-[34rem]:col-start-2 @min-[34rem]:row-start-3 @min-[56rem]:col-start-3 @min-[56rem]:row-start-2`,
  severity: `${STACKED} @min-[34rem]:col-start-3 @min-[34rem]:row-start-3 @min-[56rem]:col-start-4 @min-[56rem]:row-start-2`,
  photos: `${STACKED} @min-[34rem]:col-start-4 @min-[34rem]:row-start-3 @min-[56rem]:col-start-5 @min-[56rem]:row-start-2`,
} as const;

/**
 * The column labels of a section header: from 34rem (a tablet), on a line of their own under the
 * section's title, over the Comment | Status | Responsible line of each row; on wide sheets beside
 * the title, over the columns of the one line.
 */
export const COLUMN_LABEL = {
  comment:
    'hidden @min-[34rem]:block @min-[34rem]:col-start-2 @min-[34rem]:row-start-2 @min-[56rem]:col-start-3 @min-[56rem]:row-start-1',
  status:
    'hidden @min-[34rem]:block @min-[34rem]:col-start-3 @min-[34rem]:row-start-2 @min-[56rem]:col-start-4 @min-[56rem]:row-start-1',
  resp: 'hidden @min-[34rem]:block @min-[34rem]:col-start-4 @min-[34rem]:row-start-2 @min-[56rem]:col-start-5 @min-[56rem]:row-start-1',
} as const;

/**
 * A field's label in a row ("Responsible", a NOK row's "Category" and "Severity"): grey, as any
 * field label; the red bar already marks the row. Stacked (a phone), the labels are as wide, so
 * the selects after them line up.
 */
export const ROW_LABEL = 'shrink-0 text-xs font-medium text-ink-500 @max-[34rem]:w-20';

/**
 * Read-only rows (a finalised inspection) have nothing left to fill in, so they don't keep an
 * empty column for each field: ref | checkpoint, with its comment and a NOK row's category and
 * severity under it | Status | Responsible. From 34rem (a tablet) a row without a comment is one
 * line, so 90 rows of "✓ OK" stay short and the statuses form one column next to the text;
 * below that everything stacks, as in the fill-in sheet. Status is as wide as its badge.
 */
export const READ_GRID =
  'grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2 gap-y-1 @min-[34rem]:grid-cols-[2.25rem_minmax(0,1fr)_7rem_10rem] @min-[34rem]:gap-y-0';

export const READ_CELL = {
  ref: 'col-start-1 row-start-1',
  text: 'col-start-2 row-start-1',
  status: 'col-start-2 @min-[34rem]:col-start-3 @min-[34rem]:row-start-1',
  resp: 'col-start-2 @min-[34rem]:col-start-4 @min-[34rem]:row-start-1',
  /** The comment and a NOK row's category and severity, under the checkpoint. */
  notes: 'col-start-2 @min-[34rem]:row-start-2',
  photos: 'col-start-2 @min-[34rem]:col-start-4 @min-[34rem]:row-start-2',
} as const;

/** Read-only sheets: the Status and Responsible column labels, from 34rem. */
export const READ_LABELS = 'hidden @min-[34rem]:block';

/**
 * Controls are 44 px high for fingers (tablet layout, or any touch screen), so a status segment
 * is at least 40 px, and 32 px on a desktop with a mouse, where 90+ rows should stay compact.
 */
export const CONTROL_HEIGHT = 'h-11 @min-[56rem]:pointer-fine:h-8';

/** The white sheet, like the printed page; a narrower margin on a phone, where width is short. */
export const SHEET =
  'rounded-lg border border-ink-200 bg-surface px-3 py-5 shadow-xs @min-[34rem]:px-6 @min-[34rem]:py-6 @min-[56rem]:px-8 @min-[56rem]:py-8';

/** Header row of a section: light grey like the print. */
export const SECTION_HEADER = 'items-center border-y border-ink-300 bg-ink-50 py-1.5';

/** One checklist line. */
export const ROW_LINE = 'border-b border-ink-200 py-1.5';

/**
 * Text fields in a row. The underline is ink-500 at 80 % (3.4:1 on white), as WCAG 1.4.11 asks of
 * a control; in the dark theme ink-400 (3.7:1 on the sheet), as heavy as in the light one, where
 * ink-500 is a light grey that would make every row a stack of bright lines.
 */
export const FIELD =
  'w-full min-w-0 rounded-t-sm border border-transparent border-b-ink-500/80 bg-transparent px-2 text-sm text-ink-900 transition-colors placeholder:text-ink-500 hover:border-b-ink-700 @min-[56rem]:placeholder:text-transparent hover:bg-ink-100/60 focus-visible:rounded-sm focus-visible:border-brand-600 focus-visible:bg-surface focus-visible:outline-1 focus-visible:outline-offset-0 dark:border-b-ink-400 dark:hover:not-focus-visible:border-b-ink-500';

/**
 * A row's Responsible select while it is empty: its "Responsible" reads like the placeholder of a
 * text field, and on wide sheets, where the column label says it, it is hidden as they are
 * until the keyboard reaches it (then it shows it is a list). Its options set their own colour,
 * so the open list never inherits the hidden text.
 */
export const EMPTY_SELECT =
  'data-empty:text-ink-500 @min-[56rem]:data-empty:not-focus-visible:text-transparent';

/** "Row 3.c has no status." (brief §5.3 Finalise): red outline and tint, as in the template editor. */
export const ISSUE_OUTLINE = 'bg-nok-bg outline-1 -outline-offset-1 outline-nok-fg';

/**
 * A focused row: the cyan ring drawn inside the row, so it isn't hidden by its neighbours. It
 * overrides the red issue outline while focused. On `:focus`, not `:focus-visible`: the focused
 * row is where the next status key goes, also after a click (a status segment, Continue, a jump
 * link), when Chrome would not count the focus as visible.
 */
export const ROW_FOCUS = 'focus:outline-2 focus:-outline-offset-2 focus:outline-brand-600';

/** NOK rows get a red bar down the left edge (brief §5.3). */
export const NOK_BAR = 'before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-nok-fg';
