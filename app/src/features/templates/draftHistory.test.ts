import type { Section, TemplateDraftInput } from '@modig/shared';
import { describe, expect, it } from 'vitest';
import { canRedo, canUndo, HISTORY_LIMIT } from '../../lib/history';
import {
  changedPlace,
  recordDraft,
  startDraftHistory,
  stepDraft,
  TYPING_PAUSE_MS,
  typedIn,
  type DraftHistory,
} from './draftHistory';

const row = (id: string, text: string) => ({ id, text });
const SECTIONS: Section[] = [
  { id: 'Sect000000000001', title: 'Safety', items: [row('Item000000000001', 'Decals')] },
  { id: 'Sect000000000002', title: 'Backpack', items: [row('Item000000000002', 'Damages')] },
];
const DRAFT: TemplateDraftInput = {
  name: 'Final inspection',
  modelCode: 'RMMG',
  sections: SECTIONS,
};

/** The draft with row `index` of section 0 saying `text`. */
const typed = (draft: TemplateDraftInput, text: string, index = 0): TemplateDraftInput => ({
  ...draft,
  sections: [
    {
      ...draft.sections[0]!,
      items: draft.sections[0]!.items.map((item, at) => (at === index ? { ...item, text } : item)),
    },
    ...draft.sections.slice(1),
  ],
});

/** Records each draft a second (or `gap` ms) after the one before. */
function run(drafts: TemplateDraftInput[], gap = 1000, start = startDraftHistory(DRAFT)) {
  return drafts.reduce<DraftHistory>(
    (state, draft, index) => recordDraft(state, draft, 10_000 + index * gap),
    start,
  );
}

describe('typedIn', () => {
  it('names the field typed in', () => {
    expect(typedIn(DRAFT, typed(DRAFT, 'Decal'))).toBe('/sections/0/items/0/text');
    expect(typedIn(DRAFT, { ...DRAFT, name: 'Final' })).toBe('/name');
  });

  it('counts a quality check’s name and the template’s name following it as one field', () => {
    const before = { ...DRAFT, quality: { name: 'Pre' } } as TemplateDraftInput;
    const after = { ...before, name: 'Pre start', quality: { name: 'Pre start' } };
    expect(typedIn(before, after as TemplateDraftInput)).toBe('/name|/quality/name');
  });

  it('is null for more than typing, and empty for no change', () => {
    const added = {
      ...DRAFT,
      sections: [...SECTIONS, { id: 'Sect000000000003', title: '', items: [] }],
    };
    expect(typedIn(DRAFT, added)).toBeNull();
    expect(typedIn(DRAFT, { ...DRAFT, sections: [SECTIONS[1]!, SECTIONS[0]!] })).toBeNull();
    expect(typedIn(DRAFT, { ...DRAFT, coverImageId: 'Imag000000000001' })).toBeNull();
    expect(typedIn(DRAFT, { ...DRAFT, sections: [...SECTIONS] })).toBe('');
  });
});

describe('recordDraft', () => {
  it('makes typing on in the same field one step', () => {
    const state = run([
      typed(DRAFT, 'Decals!'),
      typed(DRAFT, 'Decals!!'),
      typed(DRAFT, 'Decals!!!'),
    ]);
    expect(state.history.past).toEqual([DRAFT]);
    expect(state.history.present.sections[0]!.items[0]!.text).toBe('Decals!!!');
  });

  it('starts a new step after a pause, in another field, or after another kind of change', () => {
    const paused = run([typed(DRAFT, 'a'), typed(DRAFT, 'ab')], TYPING_PAUSE_MS + 1);
    expect(paused.history.past).toHaveLength(2);
    const elsewhere = run([
      typed(DRAFT, 'a'),
      { ...typed(DRAFT, 'a'), name: 'Final inspection 2' },
    ]);
    expect(elsewhere.history.past).toHaveLength(2);
    const moved = { ...DRAFT, sections: [SECTIONS[1]!, SECTIONS[0]!] };
    const structure = run([moved, moved, { ...moved, name: 'X' }]);
    expect(structure.history.past).toHaveLength(2);
  });

  it('records nothing for a copy of the same draft, and keeps the redo', () => {
    let state = stepDraft(run([typed(DRAFT, 'a')]), 'undo');
    state = recordDraft(state, { ...state.history.present }, 99_999);
    expect(canRedo(state.history)).toBe(true);
    expect(canUndo(state.history)).toBe(false);
  });

  it('keeps the last HISTORY_LIMIT steps', () => {
    const drafts = Array.from({ length: HISTORY_LIMIT + 10 }, (_, index) => ({
      ...DRAFT,
      modelCode: `M${index}`,
    }));
    expect(run(drafts).history.past).toHaveLength(HISTORY_LIMIT);
  });
});

describe('stepDraft', () => {
  it('goes back and forth through the steps', () => {
    const first = typed(DRAFT, 'One');
    const second = { ...first, name: 'Two' };
    let state = run([first, second]);
    state = stepDraft(state, 'undo');
    expect(state.history.present).toBe(first);
    state = stepDraft(state, 'undo');
    expect(state.history.present).toBe(DRAFT);
    expect(stepDraft(state, 'undo')).toBe(state);
    state = stepDraft(state, 'redo');
    expect(state.history.present).toBe(first);
  });

  it('makes typing after an undo a new step', () => {
    let state = run([typed(DRAFT, 'Dec'), typed(DRAFT, 'Decal', 0)], 5000);
    state = stepDraft(state, 'undo');
    state = recordDraft(state, typed(DRAFT, 'Decx'), state.at + 10);
    expect(state.history.past.map((draft) => draft.sections[0]!.items[0]!.text)).toEqual([
      'Decals',
      'Dec',
    ]);
  });
});

describe('changedPlace', () => {
  it('finds the row that changed or came back', () => {
    expect(changedPlace(DRAFT, typed(DRAFT, 'Decal'))).toEqual({
      kind: 'row',
      itemId: 'Item000000000001',
    });
    const without = { ...DRAFT, sections: [{ ...SECTIONS[0]!, items: [] }, SECTIONS[1]!] };
    expect(changedPlace(without, DRAFT)).toEqual({ kind: 'row', itemId: 'Item000000000001' });
  });

  it('finds the section a row left, or a section that came back or moved', () => {
    const without = { ...DRAFT, sections: [{ ...SECTIONS[0]!, items: [] }, SECTIONS[1]!] };
    expect(changedPlace(DRAFT, without)).toEqual({
      kind: 'section',
      sectionId: 'Sect000000000001',
    });
    expect(changedPlace({ ...DRAFT, sections: [SECTIONS[1]!] }, DRAFT)).toEqual({
      kind: 'section',
      sectionId: 'Sect000000000001',
    });
    expect(changedPlace(DRAFT, { ...DRAFT, sections: [SECTIONS[0]!] })).toEqual({
      kind: 'section',
      sectionId: 'Sect000000000001',
    });
  });

  it('is null when only the settings changed', () => {
    expect(changedPlace(DRAFT, { ...DRAFT, name: 'Other' })).toBeNull();
  });
});
