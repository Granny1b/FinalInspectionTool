/** Shell geometry shared by the real shell and its loading skeleton, so the two line up exactly. */
export const SIDEBAR_FRAME =
  'hidden border-r border-ink-200 bg-surface lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-64 lg:flex-col';
export const CONTENT_OFFSET = 'lg:pl-64';
export const CONTENT_FRAME = 'mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10';
/** A nav link's height: taller on a touch screen, so a finger finds it in the tablet drawer. */
export const NAV_ITEM_HEIGHT = 'h-9 pointer-coarse:h-11';
/** The signed-in user's panel at the foot of the sidebar, and the height of its Sign out row. */
export const USER_PANEL = 'border-t border-ink-200 p-3';
export const USER_PANEL_ROW = 'h-7 pointer-coarse:h-9';
/** Top bar with the menu button below `lg` (tablets). */
export const MOBILE_BAR =
  'sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-ink-200 bg-surface px-2 sm:px-4 lg:hidden';
