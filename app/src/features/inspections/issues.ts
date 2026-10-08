/**
 * Where a finalise problem (or a deviation's "Go to row") is fixed: which tab to show and which
 * element to focus. The ids are the DOM hooks of the checklist sheet (`row-{itemId}`), the front
 * page card and the Deviation Summary.
 */
import type { FinaliseIssue } from '@modig/shared';

export type InspectionTab = 'checklist' | 'deviations';

export type FocusTarget = {
  /** The tab that shows the element. */
  tab: InspectionTab;
  elementId: string;
};

export const FRONT_FIELD_IDS = {
  machineName: 'front-machine-name',
  serialNumber: 'front-serial-number',
} as const;

export const rowElementId = (itemId: string) => `row-${itemId}`;
export const extraDescriptionId = (extraId: string) => `extra-${extraId}-description`;
/** A deviation's photos on the Deviations tab, by deviation key (item id or extra id). */
export const deviationPhotosId = (key: string) => `deviation-${key}-photos`;
/** The tabs and their panels; `prefix` keeps the ids unique on the page. */
export const tabId = (prefix: string, tab: InspectionTab) => `${prefix}-tab-${tab}`;
export const panelId = (prefix: string, tab: InspectionTab) => `${prefix}-panel-${tab}`;

/** The front page sits at the top of the Checklist tab. */
export function issueTarget(target: FinaliseIssue['target']): FocusTarget {
  switch (target.kind) {
    case 'front':
      return { tab: 'checklist', elementId: FRONT_FIELD_IDS[target.field] };
    case 'row':
      return { tab: 'checklist', elementId: rowElementId(target.itemId) };
    case 'extra':
      return { tab: 'deviations', elementId: extraDescriptionId(target.extraId) };
  }
}

/** Front-page problems by field, for the card's error messages. */
export function frontIssues(
  issues: readonly FinaliseIssue[],
): Partial<Record<keyof typeof FRONT_FIELD_IDS, string>> {
  const messages: Partial<Record<keyof typeof FRONT_FIELD_IDS, string>> = {};
  for (const { target, message } of issues) {
    if (target.kind === 'front') messages[target.field] = message;
  }
  return messages;
}

/** Extra-deviation problems by extra id. */
export function extraIssues(issues: readonly FinaliseIssue[]): ReadonlyMap<string, string> {
  const messages = new Map<string, string>();
  for (const { target, message } of issues) {
    if (target.kind === 'extra') messages.set(target.extraId, message);
  }
  return messages;
}
