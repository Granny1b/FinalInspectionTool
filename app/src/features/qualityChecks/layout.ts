/**
 * A quality check's row as a card: its pictures on the left, the text in the middle and, on a
 * wide sheet, the time and the row's menu in a column on the right. On a narrow one (a phone) the
 * pictures are a small tile and the time and menu go below the text. Container queries: the
 * sheet is the container (TemplateDocument).
 */
export const ROW_CARD = 'grid gap-x-3 rounded-lg border p-3 transition-colors @min-[36rem]:gap-x-4';

/**
 * Pictures | What on a narrow sheet, with How, references, more information and the time each a
 * line of their own across the card. On a wide one: pictures | What, How, references and more
 * information one under another | the time and the menu; the last line takes what the picture
 * leaves over, so the text above it keeps together.
 */
export const CARD_COLUMNS =
  'grid-cols-[4.5rem_minmax(0,1fr)] @min-[36rem]:grid-cols-[9rem_minmax(0,1fr)_auto] @min-[36rem]:grid-rows-[auto_auto_auto_1fr]';
/**
 * A read-only row without pictures: on a narrow sheet the text takes their place; on a wide one
 * their column stays empty, so the text lines up with the other rows'.
 */
export const CARD_COLUMNS_TEXT =
  'grid-cols-[minmax(0,1fr)] @min-[36rem]:grid-cols-[9rem_minmax(0,1fr)_auto] @min-[36rem]:grid-rows-[auto_auto_auto_1fr]';

/** The pictures: beside What on a narrow sheet, down the card's left on a wide one. */
export const PICTURE_CELL = 'self-start @min-[36rem]:row-span-4';
/** How, references, more information: across a narrow card; under What on a wide one. */
export const DETAIL_CELL =
  'col-span-full mt-1 min-w-0 @min-[36rem]:col-span-1 @min-[36rem]:col-start-2 @min-[36rem]:pl-9';
/** The time (and an editable row's menu): last on a narrow card, the right column on a wide one. */
export const CONTROLS_CELL =
  'col-span-full mt-2 @min-[36rem]:col-span-1 @min-[36rem]:col-start-3 @min-[36rem]:row-span-4 @min-[36rem]:row-start-1 @min-[36rem]:mt-0';

/** The rows of a section: cards one under another. */
export const ROW_LIST = 'space-y-2 pt-2';

/** A section's header: its number, title, size and time, and its menu. */
export const SECTION_BAR =
  'grid min-h-11 grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center rounded-md border border-ink-200 @min-[36rem]:grid-cols-[2.25rem_minmax(0,1fr)_auto_auto]';
