/**
 * Undo and redo in the template editor: every change to the draft (its settings, its front page,
 * the checklist's text and structure, guides) is a step, the last HISTORY_LIMIT kept. Typing on
 * in the same field is one step until a pause, so Ctrl+Z takes back a phrase rather than a
 * letter. Pure, so the rules are unit-tested; the editor only keeps it and applies its present.
 */
import type { TemplateDraftInput } from '@modig/shared';
import { amend, record, redo, startHistory, undo, type History } from '../../lib/history';

/** Typing in the same field with no longer pause than this is one step. */
export const TYPING_PAUSE_MS = 1500;

export type DraftHistory = {
  history: History<TemplateDraftInput>;
  /** The text field(s) the last step typed in, while typing there can be added to it. */
  typing: string | null;
  /** When the last step was recorded (ms). */
  at: number;
};

export function startDraftHistory(draft: TemplateDraftInput): DraftHistory {
  return { history: startHistory(draft), typing: null, at: 0 };
}

/** The draft changed to `next` at `now` (ms): a step, or more of the typing that was the last. */
export function recordDraft(
  state: DraftHistory,
  next: TemplateDraftInput,
  now: number,
): DraftHistory {
  const present = state.history.present;
  if (next === present) return state;
  const typing = typedIn(present, next);
  // The same content again (a copy): nothing to undo, and the redo stays.
  if (typing === '') return { ...state, history: { ...state.history, present: next } };
  const more = typing !== null && typing === state.typing && now - state.at <= TYPING_PAUSE_MS;
  return {
    history: more ? amend(state.history, next) : record(state.history, next),
    typing,
    at: now,
  };
}

/** One step back (`undo`) or forward (`redo`); the same state when there is none. */
export function stepDraft(state: DraftHistory, direction: 'undo' | 'redo'): DraftHistory {
  const history = direction === 'undo' ? undo(state.history) : redo(state.history);
  // Typing after an undo is a new step, never added to the one undone to.
  return history === state.history ? state : { history, typing: null, at: 0 };
}

/**
 * Which text fields an edit typed in, as their paths ("sections/0/items/2/text"), or null when it
 * is more than typing: rows or sections added, removed or moved, another model or cover photo, a
 * number changed, a field that wasn't there. '' when nothing changed. A quality check's name is typed in two fields
 * at once (the template's name follows it), which is still one field's typing.
 */
export function typedIn(before: TemplateDraftInput, after: TemplateDraftInput): string | null {
  const paths: string[] = [];
  return changedTexts(before, after, '', paths) ? paths.join('|') : null;
}

function changedTexts(before: unknown, after: unknown, path: string, paths: string[]): boolean {
  if (Object.is(before, after)) return true;
  if (typeof before === 'string' && typeof after === 'string') {
    paths.push(path);
    return true;
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    if (before.length !== after.length) return false;
    return before.every((value, index) =>
      changedTexts(value, after[index], `${path}/${index}`, paths),
    );
  }
  if (isRecord(before) && isRecord(after)) {
    const keys = Object.keys(before);
    if (keys.length !== Object.keys(after).length) return false;
    return keys.every(
      (key) =>
        key in after &&
        // An id or a code is no text: another one is another row, section, model or photo.
        (!IDENTITY.test(key) || Object.is(before[key], after[key])) &&
        changedTexts(before[key], after[key], `${path}/${key}`, paths),
    );
  }
  return false;
}

/** `id`, `coverImageId`, `modelCode` …: strings that name something rather than say it. */
const IDENTITY = /^id$|Id$|Code$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Where an undo or redo changed the checklist, to bring it into view. */
export type ChangedPlace = { kind: 'row'; itemId: string } | { kind: 'section'; sectionId: string };

/**
 * The first row or section that differs between two drafts, as it is after the step (a row that
 * came back, the section a row left); null when only the settings or front page changed, or the
 * change was removing the last of them.
 */
export function changedPlace(
  before: TemplateDraftInput,
  after: TemplateDraftInput,
): ChangedPlace | null {
  const count = Math.max(before.sections.length, after.sections.length);
  for (let index = 0; index < count; index++) {
    const was = before.sections[index];
    const now = after.sections[index];
    if (was === now) continue;
    if (!now) return after.sections.at(-1) ? section(after.sections.at(-1)!.id) : null;
    if (!was || was.id !== now.id) return section(now.id);
    const rows = Math.max(was.items.length, now.items.length);
    for (let row = 0; row < rows; row++) {
      const item = now.items[row];
      if (was.items[row] === item) continue;
      // A row removed from the end: the section it was in.
      return item ? { kind: 'row', itemId: item.id } : section(now.id);
    }
    return section(now.id);
  }
  return null;
}

function section(sectionId: string): ChangedPlace {
  return { kind: 'section', sectionId };
}
