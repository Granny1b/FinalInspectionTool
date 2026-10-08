/**
 * Column geometry shared by section headers, rows and spare rows, so everything lines up like the
 * printed table: ref | checkpoint | Comment | Status | Resp.
 *
 * The paper-only columns (Comment, Status, Resp) just hint at the print layout. They appear when
 * the sheet itself is wide enough (a container query, `@min-[52rem]`), so not on tablets; there
 * the third column holds the edit controls instead. On a wide sheet the row controls float over
 * the empty Status/Resp cells, so they never take width from the checkpoint text. Every cell is
 * placed explicitly (column and row 1) because of that overlap.
 */
export const GRID =
  'grid grid-cols-[2.25rem_minmax(0,1fr)_auto] @min-[52rem]:grid-cols-[2.25rem_minmax(0,1fr)_10rem_4.5rem_4.5rem]';

/** Ref and checkpoint cells. */
export const REF_CELL = 'col-start-1 row-start-1 pl-2 text-sm tabular-nums';
export const TEXT_CELL = 'col-start-2 row-start-1 flex min-w-0';

/** Where row controls go: the third column on narrow sheets, over Status/Resp on wide ones. */
export const ROW_CONTROLS =
  'col-start-3 row-start-1 self-start justify-self-end @min-[52rem]:col-span-2 @min-[52rem]:col-start-4';

/** The white sheet; its left padding is the gutter the drag handles sit in. */
export const SHEET =
  'rounded-lg border border-ink-200 bg-surface px-8 py-8 shadow-xs @min-[52rem]:px-12 @min-[52rem]:py-10';

/** Header row of a section; filled light grey like the print (`HEADER_FILL`) unless it has an issue. */
export const SECTION_HEADER = 'min-h-11 items-center border-y border-ink-300';
export const HEADER_FILL = 'bg-ink-50';

/** One checklist line. */
export const ROW_LINE = 'min-h-10 border-b border-ink-200';

/**
 * Publish problem on a section or row (brief §5.2): red outline and tint. Backgrounds are opaque
 * because the row controls inherit them to cover the cell borders underneath.
 */
export const ISSUE_OUTLINE = 'rounded-sm bg-nok-bg outline-1 -outline-offset-1 outline-nok-fg';
