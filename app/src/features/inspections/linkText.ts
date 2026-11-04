/**
 * The text inside a link-styled button whose box is padded out to a touch target ("Continue at
 * 3.b", a deviation card's "1.d ↳"). The hover underline and the focus ring go around the text, as
 * on any link, not around the padding, where the ring would make it look like a button. The
 * button itself is `group outline-none`: its ring is this one.
 */
export const LINK_TEXT =
  'inline-flex items-center gap-1 rounded-sm underline-offset-2 group-hover:underline group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-brand-600';
