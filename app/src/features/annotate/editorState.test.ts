import { ANNOTATION_COLORS, type Annotation } from '@modig/shared';
import { describe, expect, it } from 'vitest';
import {
  annotationsOf,
  editorReducer,
  initialEditorState,
  sameAnnotations,
  type EditorAction,
  type EditorState,
} from './editorState';
import { canRedo, canUndo } from './history';
import { DEFAULT_COLOR, DEFAULT_TOOL } from './tools';

const { red: RED, cyan: CYAN, yellow: YELLOW } = ANNOTATION_COLORS;
const ARROW: Annotation = { kind: 'arrow', points: [0.1, 0.1, 0.5, 0.5], color: RED };
const BOX: Annotation = { kind: 'rect', x: 0.2, y: 0.2, w: 0.3, h: 0.3, color: RED };
const LABEL: Annotation = { kind: 'text', x: 0.6, y: 0.1, text: 'Burr', color: RED, size: 0.05 };

function run(state: EditorState, ...actions: EditorAction[]): EditorState {
  return actions.reduce(editorReducer, state);
}

const empty = () => initialEditorState([]);

describe('initialEditorState', () => {
  it('starts with the stored marks, the default tool and colour, nothing selected', () => {
    const state = initialEditorState([ARROW, BOX]);
    expect(annotationsOf(state)).toEqual([ARROW, BOX]);
    expect(state.history.present.map((item) => item.id)).toEqual([1, 2]);
    expect(state).toMatchObject({
      tool: DEFAULT_TOOL,
      color: DEFAULT_COLOR,
      selectedId: null,
      text: null,
      nextId: 3,
    });
    expect(canUndo(state.history)).toBe(false);
  });

  it('starts drawing arrows in red', () => {
    expect(DEFAULT_TOOL).toBe('arrow');
    expect(DEFAULT_COLOR).toBe(RED);
  });
});

describe('tool and colour', () => {
  it('switches the tool without touching the marks', () => {
    const state = run(initialEditorState([ARROW]), { type: 'tool', tool: 'ellipse' });
    expect(state.tool).toBe('ellipse');
    expect(annotationsOf(state)).toEqual([ARROW]);
    expect(canUndo(state.history)).toBe(false);
  });

  it('leaves the selection to the select tool: a drawing tool clears it', () => {
    let state = run(
      initialEditorState([ARROW]),
      { type: 'tool', tool: 'select' },
      { type: 'select', id: 1 },
      { type: 'tool', tool: 'select' },
    );
    expect(state.selectedId).toBe(1);
    state = run(state, { type: 'tool', tool: 'text' });
    expect(state.selectedId).toBeNull();
  });

  it('never recolours the last mark drawn when a colour is picked for the next one', () => {
    const state = run(
      empty(),
      { type: 'tool', tool: 'ellipse' },
      { type: 'color', color: YELLOW },
      { type: 'add', annotation: { ...BOX, kind: 'ellipse', color: YELLOW } },
      { type: 'color', color: CYAN },
      { type: 'add', annotation: { ...ARROW, color: CYAN } },
    );
    expect(annotationsOf(state).map((annotation) => annotation.color)).toEqual([YELLOW, CYAN]);
  });

  it('sets the colour for the next mark; with nothing selected that is no step', () => {
    const state = run(empty(), { type: 'color', color: CYAN });
    expect(state.color).toBe(CYAN);
    expect(canUndo(state.history)).toBe(false);
  });

  it('recolours the selected mark as one undoable step', () => {
    let state = run(
      initialEditorState([ARROW, BOX]),
      { type: 'select', id: 2 },
      { type: 'color', color: YELLOW },
    );
    expect(annotationsOf(state)).toEqual([ARROW, { ...BOX, color: YELLOW }]);
    expect(state.color).toBe(YELLOW);
    state = run(state, { type: 'undo' });
    expect(annotationsOf(state)).toEqual([ARROW, BOX]);
    // The picked colour stays: undo is about the marks.
    expect(state.color).toBe(YELLOW);
  });

  it('records nothing when the selected mark already has that colour', () => {
    const state = run(
      initialEditorState([ARROW]),
      { type: 'select', id: 1 },
      { type: 'color', color: RED },
    );
    expect(canUndo(state.history)).toBe(false);
  });

  it('gives a label being typed the new colour instead of the selected mark', () => {
    const state = run(
      initialEditorState([ARROW]),
      { type: 'text-start', at: { x: 0.5, y: 0.5 }, size: 0.05 },
      { type: 'color', color: CYAN },
    );
    expect(state.text?.color).toBe(CYAN);
    expect(annotationsOf(state)).toEqual([ARROW]);
  });
});

describe('selection', () => {
  it('selects an existing mark and clears with null', () => {
    let state = run(initialEditorState([ARROW]), { type: 'select', id: 1 });
    expect(state.selectedId).toBe(1);
    state = run(state, { type: 'select', id: null });
    expect(state.selectedId).toBeNull();
  });

  it('ignores an id that is not there', () => {
    expect(run(initialEditorState([ARROW]), { type: 'select', id: 7 }).selectedId).toBeNull();
  });
});

describe('add', () => {
  it('adds a mark with a fresh id, without selecting it', () => {
    const state = run(initialEditorState([ARROW]), { type: 'add', annotation: BOX });
    expect(annotationsOf(state)).toEqual([ARROW, BOX]);
    expect(state.history.present.map((item) => item.id)).toEqual([1, 2]);
    expect(state.selectedId).toBeNull();
    expect(state.nextId).toBe(3);
    expect(canUndo(state.history)).toBe(true);
  });

  it('never reuses an id, even after a delete', () => {
    const state = run(
      initialEditorState([ARROW, BOX]),
      { type: 'select', id: 2 },
      { type: 'delete' },
      { type: 'add', annotation: LABEL },
    );
    expect(state.history.present.map((item) => item.id)).toEqual([1, 3]);
  });
});

describe('move', () => {
  it('moves one mark as one step', () => {
    const state = run(initialEditorState([ARROW, BOX]), { type: 'move', id: 2, dx: 0.1, dy: -0.1 });
    expect(annotationsOf(state)).toEqual([ARROW, { ...BOX, x: 0.3, y: 0.1 }]);
    expect(run(state, { type: 'undo' }).history.present[1]?.annotation).toEqual(BOX);
  });

  it('keeps the mark on the photo', () => {
    const state = run(initialEditorState([BOX]), { type: 'move', id: 1, dx: 2, dy: -2 });
    expect(annotationsOf(state)).toEqual([{ ...BOX, x: 0.7, y: 0 }]);
  });

  it('records nothing for a move of zero (a click on a mark)', () => {
    const before = initialEditorState([ARROW]);
    expect(run(before, { type: 'move', id: 1, dx: 0, dy: 0 })).toBe(before);
  });
});

describe('delete', () => {
  it('removes the selected mark and clears the selection', () => {
    const state = run(
      initialEditorState([ARROW, BOX]),
      { type: 'select', id: 1 },
      { type: 'delete' },
    );
    expect(annotationsOf(state)).toEqual([BOX]);
    expect(state.selectedId).toBeNull();
  });

  it('does nothing with nothing selected', () => {
    const before = initialEditorState([ARROW]);
    expect(run(before, { type: 'delete' })).toBe(before);
  });
});

describe('undo and redo', () => {
  it('steps back and forth through drawing, moving and deleting', () => {
    let state = run(
      empty(),
      { type: 'add', annotation: ARROW },
      { type: 'add', annotation: BOX },
      { type: 'move', id: 1, dx: 0.1, dy: 0 },
      { type: 'select', id: 2 },
      { type: 'delete' },
    );
    const moved = { ...ARROW, points: [0.2, 0.1, 0.6, 0.5] };
    expect(annotationsOf(state)).toEqual([moved]);
    state = run(state, { type: 'undo' });
    expect(annotationsOf(state)).toEqual([moved, BOX]);
    state = run(state, { type: 'undo' }, { type: 'undo' });
    expect(annotationsOf(state)).toEqual([ARROW]);
    state = run(state, { type: 'redo' }, { type: 'redo' }, { type: 'redo' });
    expect(annotationsOf(state)).toEqual([moved]);
    expect(canRedo(state.history)).toBe(false);
  });

  it('clears the selection when undo removes the selected mark', () => {
    let state = run(empty(), { type: 'add', annotation: ARROW }, { type: 'select', id: 1 });
    expect(state.selectedId).toBe(1);
    state = run(state, { type: 'undo' });
    expect(annotationsOf(state)).toEqual([]);
    expect(state.selectedId).toBeNull();
  });

  it('keeps the selection when the mark is still there', () => {
    const state = run(
      initialEditorState([ARROW]),
      { type: 'add', annotation: BOX },
      { type: 'select', id: 1 },
      { type: 'undo' },
    );
    expect(state.selectedId).toBe(1);
  });

  it('a new step after undo drops the redo', () => {
    const state = run(
      empty(),
      { type: 'add', annotation: ARROW },
      { type: 'undo' },
      { type: 'add', annotation: BOX },
    );
    expect(canRedo(state.history)).toBe(false);
    expect(annotationsOf(state)).toEqual([BOX]);
  });

  it('ends a label being typed', () => {
    const state = run(
      empty(),
      { type: 'add', annotation: ARROW },
      { type: 'text-start', at: { x: 0.2, y: 0.2 }, size: 0.05 },
      { type: 'undo' },
    );
    expect(state.text).toBeNull();
  });
});

describe('text labels', () => {
  const start: EditorAction = { type: 'text-start', at: { x: 0.25, y: 0.75 }, size: 0.05 };

  it('adds a typed label where it was placed, in the current colour, as one step', () => {
    const state = run(
      empty(),
      { type: 'color', color: YELLOW },
      start,
      { type: 'text-change', value: '  Loose screw ' },
      { type: 'text-commit' },
    );
    expect(annotationsOf(state)).toEqual([
      { kind: 'text', x: 0.25, y: 0.75, text: 'Loose screw', color: YELLOW, size: 0.05 },
    ]);
    expect(state.text).toBeNull();
    expect(state.selectedId).toBeNull();
    expect(state.history.past).toHaveLength(1);
  });

  it('adds nothing for an empty label', () => {
    const state = run(
      empty(),
      start,
      { type: 'text-change', value: '   ' },
      { type: 'text-commit' },
    );
    expect(annotationsOf(state)).toEqual([]);
    expect(canUndo(state.history)).toBe(false);
  });

  it('starting a label clears the selection', () => {
    const state = run(initialEditorState([ARROW]), { type: 'select', id: 1 }, start);
    expect(state.selectedId).toBeNull();
    expect(state.text).toMatchObject({ id: null, value: '', color: RED });
  });

  it('edits an existing label in place', () => {
    let state = run(initialEditorState([ARROW, LABEL]), { type: 'text-edit', id: 2 });
    expect(state.text).toEqual({
      id: 2,
      at: { x: 0.6, y: 0.1 },
      size: 0.05,
      color: RED,
      value: 'Burr',
    });
    expect(state.selectedId).toBe(2);
    state = run(state, { type: 'text-change', value: 'Sharp burr' }, { type: 'text-commit' });
    expect(annotationsOf(state)).toEqual([ARROW, { ...LABEL, text: 'Sharp burr' }]);
    state = run(state, { type: 'undo' });
    expect(annotationsOf(state)).toEqual([ARROW, LABEL]);
  });

  it('recolours a label being edited', () => {
    const state = run(
      initialEditorState([LABEL]),
      { type: 'text-edit', id: 1 },
      { type: 'color', color: CYAN },
      { type: 'text-commit' },
    );
    expect(annotationsOf(state)).toEqual([{ ...LABEL, color: CYAN }]);
  });

  it('records nothing when an edited label is unchanged', () => {
    const state = run(
      initialEditorState([LABEL]),
      { type: 'text-edit', id: 1 },
      { type: 'text-commit' },
    );
    expect(canUndo(state.history)).toBe(false);
    expect(state.text).toBeNull();
  });

  it('removes a label whose text was erased', () => {
    const state = run(
      initialEditorState([ARROW, LABEL]),
      { type: 'text-edit', id: 2 },
      { type: 'text-change', value: '' },
      { type: 'text-commit' },
    );
    expect(annotationsOf(state)).toEqual([ARROW]);
    expect(state.selectedId).toBeNull();
  });

  it('Escape keeps the label as it was', () => {
    const state = run(
      initialEditorState([LABEL]),
      { type: 'text-edit', id: 1 },
      { type: 'text-change', value: 'Something else' },
      { type: 'text-cancel' },
    );
    expect(annotationsOf(state)).toEqual([LABEL]);
    expect(state.text).toBeNull();
  });

  it('only edits text labels', () => {
    const before = initialEditorState([ARROW]);
    expect(run(before, { type: 'text-edit', id: 1 })).toBe(before);
  });

  it('ignores typing and committing when no label is open', () => {
    const before = empty();
    expect(run(before, { type: 'text-change', value: 'x' })).toBe(before);
    expect(run(before, { type: 'text-commit' })).toBe(before);
  });
});

describe('sameAnnotations', () => {
  it('compares the marks by value and order', () => {
    expect(sameAnnotations([ARROW, BOX], [{ ...ARROW }, { ...BOX }])).toBe(true);
    expect(sameAnnotations([ARROW, BOX], [BOX, ARROW])).toBe(false);
    expect(sameAnnotations([ARROW], [{ ...ARROW, color: CYAN }])).toBe(false);
    expect(sameAnnotations([], [])).toBe(true);
  });
});
