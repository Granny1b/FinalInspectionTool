/**
 * The annotation editor's state as a reducer: the annotations with undo/redo, the tool, the
 * colour, the selection and a text label being typed. Pure, so every interaction is unit-tested;
 * the canvas only turns pointer gestures into these actions.
 */
import type { Annotation } from '@modig/shared';
import { moveAnnotation, type Point } from './geometry';
import { record, redo, startHistory, undo, type History } from './history';
import { DEFAULT_COLOR, DEFAULT_TOOL, type Tool } from './tools';

/** An annotation with an id that lives as long as the editor: React keys and the selection. */
export type Item = { id: number; annotation: Annotation };

/** A text label being typed: a new one (`id` null) or an existing one being changed. */
export type TextDraft = {
  id: number | null;
  at: Point;
  size: number;
  color: string;
  value: string;
};

export type EditorState = {
  history: History<readonly Item[]>;
  tool: Tool;
  color: string;
  selectedId: number | null;
  text: TextDraft | null;
  nextId: number;
};

export type EditorAction =
  | { type: 'tool'; tool: Tool }
  | { type: 'color'; color: string }
  | { type: 'select'; id: number | null }
  | { type: 'add'; annotation: Annotation }
  | { type: 'move'; id: number; dx: number; dy: number }
  | { type: 'delete' }
  | { type: 'undo' }
  | { type: 'redo' }
  /** A new label at `at` (fractions); `size` is its text size as a fraction of the height. */
  | { type: 'text-start'; at: Point; size: number }
  | { type: 'text-edit'; id: number }
  | { type: 'text-change'; value: string }
  | { type: 'text-commit' }
  | { type: 'text-cancel' };

export function initialEditorState(annotations: readonly Annotation[]): EditorState {
  return {
    history: startHistory(annotations.map((annotation, index) => ({ id: index + 1, annotation }))),
    tool: DEFAULT_TOOL,
    color: DEFAULT_COLOR,
    selectedId: null,
    text: null,
    nextId: annotations.length + 1,
  };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  const items = state.history.present;
  const change = (next: readonly Item[]) => ({ ...state, history: record(state.history, next) });
  const update = (id: number, patch: (annotation: Annotation) => Annotation) =>
    items.map((item) => (item.id === id ? { id, annotation: patch(item.annotation) } : item));

  switch (action.type) {
    case 'tool':
      // Selecting belongs to the select tool: with a drawing tool, picking a colour for the next
      // mark must not recolour one picked earlier.
      return {
        ...state,
        tool: action.tool,
        selectedId: action.tool === 'select' ? state.selectedId : null,
      };

    case 'color': {
      // The colour is the one for the next mark; a selected mark or a label being typed takes it
      // at once.
      const next = { ...state, color: action.color };
      if (state.text) return { ...next, text: { ...state.text, color: action.color } };
      const selected = selectedItem(state);
      if (!selected || selected.annotation.color === action.color) return next;
      return {
        ...next,
        history: record(
          state.history,
          update(selected.id, (annotation) => ({ ...annotation, color: action.color })),
        ),
      };
    }

    case 'select':
      return {
        ...state,
        selectedId: items.some((item) => item.id === action.id) ? action.id : null,
      };

    case 'add':
      // Not selected: the next mark is usually drawn right away (Ctrl+Z takes this one back).
      return {
        ...change([...items, { id: state.nextId, annotation: action.annotation }]),
        nextId: state.nextId + 1,
      };

    case 'move':
      if (action.dx === 0 && action.dy === 0) return state;
      return change(
        update(action.id, (annotation) => moveAnnotation(annotation, action.dx, action.dy)),
      );

    case 'delete': {
      const selected = selectedItem(state);
      if (!selected) return state;
      return { ...change(items.filter((item) => item !== selected)), selectedId: null };
    }

    case 'undo':
    case 'redo': {
      const history = action.type === 'undo' ? undo(state.history) : redo(state.history);
      return withValidSelection({ ...state, history, text: null });
    }

    case 'text-start':
      return {
        ...state,
        selectedId: null,
        text: { id: null, at: action.at, size: action.size, color: state.color, value: '' },
      };

    case 'text-edit': {
      const item = items.find((candidate) => candidate.id === action.id);
      if (item?.annotation.kind !== 'text') return state;
      const { x, y, size, color, text } = item.annotation;
      return {
        ...state,
        selectedId: item.id,
        text: { id: item.id, at: { x, y }, size, color, value: text },
      };
    }

    case 'text-change':
      return state.text ? { ...state, text: { ...state.text, value: action.value } } : state;

    case 'text-commit':
      return state.text ? commitText(state, state.text) : state;

    case 'text-cancel':
      return { ...state, text: null };
  }
}

/** Ends typing a label: a new one is added, an edited one updated, an emptied one removed. */
function commitText(state: EditorState, draft: TextDraft): EditorState {
  const value = draft.value.trim();
  const closed = { ...state, text: null };
  if (draft.id === null) {
    if (!value) return closed;
    return editorReducer(closed, {
      type: 'add',
      annotation: {
        kind: 'text',
        x: draft.at.x,
        y: draft.at.y,
        text: value,
        color: draft.color,
        size: draft.size,
      },
    });
  }
  const id = draft.id;
  const items = state.history.present;
  const current = items.find((item) => item.id === id)?.annotation;
  if (current?.kind !== 'text') return closed;
  if (!value) {
    return {
      ...closed,
      history: record(
        state.history,
        items.filter((item) => item.id !== id),
      ),
      selectedId: null,
    };
  }
  if (current.text === value && current.color === draft.color) return closed;
  const next = items.map((item) =>
    item.id === id ? { id, annotation: { ...current, text: value, color: draft.color } } : item,
  );
  return { ...closed, history: record(state.history, next) };
}

function selectedItem(state: EditorState): Item | undefined {
  return state.history.present.find((item) => item.id === state.selectedId);
}

/** Undo and redo can remove the selected mark; then nothing is selected. */
function withValidSelection(state: EditorState): EditorState {
  return selectedItem(state) ? state : { ...state, selectedId: null };
}

/** The annotations as stored. */
export function annotationsOf(state: EditorState): Annotation[] {
  return state.history.present.map((item) => item.annotation);
}

/** Same marks in the same order (annotations are plain data, so their JSON compares them). */
export function sameAnnotations(a: readonly Annotation[], b: readonly Annotation[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
