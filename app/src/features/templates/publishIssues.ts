import type { PublishIssue } from '@modig/shared';
import { TEMPLATE_NAME_ID } from './TemplateSettingsCard';

/**
 * Where a template-level problem is fixed: the name, or the checklist (a missing section or row).
 * validateForPublish (shared) reports a blank name before the checklist, so with a blank name the
 * first one is the name's.
 */
export function templateIssueField(
  issues: PublishIssue[],
  issue: PublishIssue,
  nameBlank: boolean,
): 'name' | 'checklist' {
  const templateIssues = issues.filter(({ target }) => target.kind === 'template');
  return nameBlank && templateIssues.indexOf(issue) === 0 ? 'name' : 'checklist';
}

/**
 * Scrolls to the field a publish problem is about and focuses it, through the checklist
 * document's DOM hooks (`data-item-text`, `data-section-title`, `data-add-row`,
 * `data-add-section`). The checklist's problem is either "Add at least one section", when there
 * is none and only Add section is there, or "Add at least one row", when every section is empty:
 * then the first section's Add row.
 */
export function focusIssue(
  target: PublishIssue['target'],
  templateField: 'name' | 'checklist',
  /** The name's input, or a quality check's position's. */
  nameFieldId: string = TEMPLATE_NAME_ID,
) {
  const selector =
    target.kind === 'item'
      ? `[data-item-text="${CSS.escape(target.itemId)}"]`
      : target.kind === 'section'
        ? `[data-section-title="${CSS.escape(target.sectionId)}"]`
        : templateField === 'name'
          ? `#${CSS.escape(nameFieldId)}`
          : '[data-add-row], [data-add-section]';
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) return;
  element.scrollIntoView({ block: 'center' });
  element.focus({ preventScroll: true });
}
