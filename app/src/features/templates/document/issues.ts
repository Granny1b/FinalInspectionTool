import type { PublishIssue } from '@modig/shared';

/** Publish problems grouped by the section or row they belong to; template-level ones are the page's. */
export type IssueIndex = {
  sections: ReadonlyMap<string, string[]>;
  items: ReadonlyMap<string, string[]>;
};

export function indexIssues(issues: readonly PublishIssue[]): IssueIndex {
  const sections = new Map<string, string[]>();
  const items = new Map<string, string[]>();
  for (const { target, message } of issues) {
    if (target.kind === 'section') push(sections, target.sectionId, message);
    if (target.kind === 'item') push(items, target.itemId, message);
  }
  return { sections, items };
}

function push(map: Map<string, string[]>, key: string, message: string): void {
  const list = map.get(key);
  if (list) list.push(message);
  else map.set(key, [message]);
}
