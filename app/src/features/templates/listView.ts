/**
 * How the Templates page shows the templates: a list (table) or cards with cover photos. Each
 * viewer's own choice, remembered in this browser; without storage it is always the list.
 */
export const TEMPLATE_VIEWS = ['list', 'cards'] as const;
export type TemplateView = (typeof TEMPLATE_VIEWS)[number];

const VIEW_KEY = 'templates.view';

/**
 * Router state for the Templates page (or a machine's Quality checks tab): the editor just
 * deleted the template or quality check with this name, and with a template this many quality
 * checks.
 */
export type TemplatesPageState = { deleted?: string; qualityChecks?: number };

export function loadTemplateView(): TemplateView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'cards' ? 'cards' : 'list';
  } catch {
    return 'list'; // Storage blocked (a private window, cleared site data).
  }
}

export function saveTemplateView(view: TemplateView): void {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // Storage blocked: the choice lasts until the page is left.
  }
}
