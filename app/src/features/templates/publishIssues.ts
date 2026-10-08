import type { PublishIssue } from '@modig/shared';
import { TEMPLATE_NAME_ID } from './TemplateSettingsCard';

/**
 * Where a template-level problem is fixed. validateForPublish (shared) reports a blank name
 * before a missing section, so with a blank name the first one is the name's.
 */
export function templateIssueField(
  issues: PublishIssue[],
  issue: PublishIssue,
  nameBlank: boolean,
) {
  const templateIssues = issues.filter(({ target }) => target.kind === 'template');
  return nameBlank && templateIssues.indexOf(issue) === 0 ? 'name' : 'add-section';
}

/**
 * Scrolls to the field a publish problem is about and focuses it, through the checklist
 * document's DOM hooks (`data-item-text`, `data-section-title`, `data-add-section`).
 */
export function focusIssue(target: PublishIssue['target'], templateField: 'name' | 'add-section') {
  const selector =
    target.kind === 'item'
      ? `[data-item-text="${CSS.escape(target.itemId)}"]`
      : target.kind === 'section'
        ? `[data-section-title="${CSS.escape(target.sectionId)}"]`
        : templateField === 'name'
          ? `#${TEMPLATE_NAME_ID}`
          : '[data-add-section]';
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) return;
  element.scrollIntoView({ block: 'center' });
  element.focus({ preventScroll: true });
}
