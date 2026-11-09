/**
 * The annotation editor's state as a reducer: the annotations with undo/redo, the tool, the
 * colour, the selection and a text label being typed. Pure, so every interaction is unit-tested;
 * the canvas only turns pointer gestures into these actions.
 */
import type { Annotation } from '@modig/shared';
import { annotationBounds, duplicateOffset, moveAnnotation, type Point } from './geometry';
import { record, redo, startHistory, undo, type History } from '../../lib/history';
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
  /** An existing label's turn (degrees), so it is typed where it is drawn. */
  rotation: number;
};

export type EditorState = {
  history: History<readonly Item[]>;
  tool: Tool;
  color: string;
  selectedId: number | null;
  text: TextDraft | null;
  nextId: number;
  /**
   * The photo's width over its height, once it is loaded: how far a turned box reaches depends
   * on it, so moves and copies keep it on the photo.
   */
  aspect: number;
};

export type EditorAction =
  | { type: 'aspect'; aspect: number }
  | { type: 'tool'; tool: Tool }
  | { type: 'color'; color: string }
  | { type: 'select'; id: number | null }
  | { type: 'add'; annotation: Annotation }
  | { type: 'move'; id: number; dx: number; dy: number }
  /** A mark resized by its handles or an arrow's end moved: its new shape. */
  | { type: 'reshape'; id: number; annotation: Annotation }
  /** A copy of the selected mark, set off from it and selected. */
  | { type: 'duplicate' }
  /** The selected mark drawn over all others (`front`) or under them (`back`). */
  | { type: 'order'; to: 'front' | 'back' }
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
    aspect: 1,
  };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  const items = state.history.present;
  const change = (next: readonly Item[]) => ({ ...state, history: record(state.history, next) });
  const update = (id: number, patch: (annotation: Annotation) => Annotation) =>
    items.map((item) => (item.id === id ? { id, annotation: patch(item.annotation) } : item));

  switch (action.type) {
    case 'aspect':
      return action.aspect > 0 && action.aspect !== state.aspect
        ? { ...state, aspect: action.aspect }
        : state;

    case 'tool':
      // Picking a tool to draw with is for a new mark: a colour picked next is for that one, not
      // for a mark picked earlier.
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
      // Not selected: the next mark is usually drawn right away, often in another colour, which
      // would recolour this one (Ctrl+Z takes it back; a press on its line picks it).
      return {
        ...change([...items, { id: state.nextId, annotation: action.annotation }]),
        nextId: state.nextId + 1,
      };

    case 'move':
      if (action.dx === 0 && action.dy === 0) return state;
      return change(
        update(action.id, (annotation) =>
          moveAnnotation(annotation, action.dx, action.dy, state.aspect),
        ),
      );

    case 'reshape': {
      const current = items.find((item) => item.id === action.id)?.annotation;
      if (current?.kind !== action.annotation.kind) return state;
      if (sameAnnotations([current], [action.annotation])) return state;
      return change(update(action.id, () => action.annotation));
    }

    case 'duplicate': {
      const selected = selectedItem(state);
      if (!selected) return state;
      const offset = duplicateOffset(annotationBounds(selected.annotation, state.aspect));
      const copy = moveAnnotation(selected.annotation, offset.x, offset.y, state.aspect);
      return {
        ...change([...items, { id: state.nextId, annotation: copy }]),
        selectedId: state.nextId,
        nextId: state.nextId + 1,
      };
    }

    case 'order': {
      const selected = selectedItem(state);
      if (!selected) return state;
      const others = items.filter((item) => item !== selected);
      const next = action.to === 'front' ? [...others, selected] : [selected, ...others];
      return next.every((item, index) => item === items[index]) ? state : change(next);
    }

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
        text: {
          id: null,
          at: action.at,
          size: action.size,
          color: state.color,
          value: '',
          rotation: 0,
        },
      };

    case 'text-edit': {
      const item = items.find((candidate) => candidate.id === action.id);
      if (item?.annotation.kind !== 'text') return state;
      const { x, y, size, color, text, rotation = 0 } = item.annotation;
      return {
        ...state,
        selectedId: item.id,
        text: { id: item.id, at: { x, y }, size, color, value: text, rotation },
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

export function selectedItem(state: EditorState): Item | undefined {
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
