/**
 * A quality check being done: each row a card, laid out by the sheet's own width (container
 * queries), so it works the same beside a sidebar, on a tablet either way up and on a phone.
 *
 * - Wide (≥ 52rem: a PC, a tablet on its side): picture | ref, What, How, references | the status
 *   buttons and the comment on the right; a NOK row's deviation fields go under the text and the
 *   buttons.
 * - Narrower (≥ 34rem: a tablet upright): picture | the text, then the buttons and the comment
 *   under the text, and the deviation fields under them.
 * - A phone: a small picture beside the text, the rest across the card.
 */
export const CARD_GRID =
  'grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-3 @min-[34rem]:grid-cols-[8.5rem_minmax(0,1fr)] @min-[34rem]:gap-x-4 @min-[52rem]:grid-cols-[10rem_minmax(0,1fr)_18.5rem]';

/**
 * Each cell's place, as `grid-column: start / span n` at every width: a span set at a larger
 * width would otherwise reset the start a smaller one set (the shorthand wins over the longhand).
 */
export const CARD_CELL = {
  /**
   * The first picture, down the card's left, over the rows the card has: on a tablet upright the
   * text and the controls; on a wide card they share a row. A NOK row's deviation fields add one.
   * (Spanning a row that is empty would leave a gap's worth of space under the card.)
   */
  picture:
    'col-start-1 row-start-1 self-start @min-[34rem]:row-[1/span_2] @min-[52rem]:row-[1/span_1]',
  pictureNok:
    'col-start-1 row-start-1 self-start @min-[34rem]:row-[1/span_3] @min-[52rem]:row-[1/span_2]',
  text: 'col-start-2 row-start-1 min-w-0',
  /** A row without pictures: across a phone's card, beside the empty picture column from 34rem. */
  textAlone: 'col-[1/span_2] row-start-1 min-w-0 @min-[34rem]:col-[2/span_1]',
  /** OK / NOK / N/A and the comment. */
  controls:
    'col-[1/span_2] row-start-2 min-w-0 @min-[34rem]:col-[2/span_1] @min-[52rem]:col-[3/span_1] @min-[52rem]:row-start-1',
  /** A NOK row's responsible, category, severity and photos. */
  deviation:
    'col-[1/span_2] row-start-3 min-w-0 @min-[34rem]:col-[2/span_1] @min-[52rem]:col-[2/span_2] @min-[52rem]:row-start-2',
} as const;

/** A row card: white on the section, a red border while NOK. */
export const CARD = 'relative rounded-lg border bg-surface p-3 transition-colors scroll-mt-2';

/**
 * The status buttons: 44 px high for a finger at the least, 52 px on a touch screen, as the
 * mockup's tablet buttons; on a PC with a mouse 40 px (still a large target in a list of cards).
 */
export const STATUS_BUTTON_HEIGHT = 'h-11 pointer-coarse:h-13';

/** A deviation field's label: grey, as every field label. */
export const FIELD_LABEL = 'block text-xs font-medium text-ink-500';
