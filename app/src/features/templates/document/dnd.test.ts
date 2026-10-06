import type { ClientRect, Collision, DroppableContainer, UniqueIdentifier } from '@dnd-kit/core';
import type { Section } from '@modig/shared';
import { describe, expect, it } from 'vitest';
import {
  bodyDndId,
  crossSectionTarget,
  documentCollisions,
  dragData,
  dragLabel,
  dropPosition,
  keyboardCoordinates,
  rowDndId,
  sectionDndId,
  sectionIndexOf,
  type DragData,
} from './dnd';

const sections: Section[] = [
  {
    id: 'A',
    title: 'Loading area',
    items: [
      { id: 'a1', text: 'one' },
      { id: 'a2', text: 'two' },
      { id: 'a3', text: 'three' },
    ],
  },
  { id: 'B', title: 'Tool arena', items: [{ id: 'b1', text: 'four' }] },
  { id: 'C', title: 'Empty', items: [] },
];
const row = (sectionId: string, itemId: string): DragData => ({ type: 'row', sectionId, itemId });
const body = (sectionId: string): DragData => ({ type: 'body', sectionId });

describe('dragData', () => {
  it('reads our data and ignores anything else', () => {
    expect(dragData({ data: { current: row('A', 'a1') } })).toEqual(row('A', 'a1'));
    expect(dragData({ data: { current: { type: 'other' } } })).toBeNull();
    expect(dragData({ data: { current: undefined } })).toBeNull();
    expect(dragData(null)).toBeNull();
  });
});

describe('crossSectionTarget', () => {
  it('stays put (null) inside the own section', () => {
    expect(crossSectionTarget(sections, 'a1', row('A', 'a3'), true)).toBeNull();
    expect(crossSectionTarget(sections, 'a1', body('A'), false)).toBeNull();
  });

  it('goes before or after the hovered row of another section', () => {
    expect(crossSectionTarget(sections, 'a2', row('B', 'b1'), false)).toEqual({
      sectionId: 'B',
      index: 0,
    });
    expect(crossSectionTarget(sections, 'b1', row('A', 'a3'), true)).toEqual({
      sectionId: 'A',
      index: 3,
    });
  });

  it('goes into an empty section', () => {
    expect(crossSectionTarget(sections, 'a1', body('C'), false)).toEqual({
      sectionId: 'C',
      index: 0,
    });
  });

  it('ignores section targets and unknown ids', () => {
    expect(crossSectionTarget(sections, 'a1', { type: 'section', sectionId: 'B' }, false)).toBe(
      null,
    );
    expect(crossSectionTarget(sections, 'nope', row('B', 'b1'), false)).toBeNull();
    expect(crossSectionTarget(sections, 'a1', row('B', 'nope'), false)).toBeNull();
  });
});

describe('dropPosition', () => {
  it('takes the place of the row it is over in its own section', () => {
    expect(dropPosition(sections, 'a1', row('A', 'a3'))).toEqual({ sectionId: 'A', index: 2 });
  });

  it('stays where the working copy has it otherwise', () => {
    expect(dropPosition(sections, 'a2', null)).toEqual({ sectionId: 'A', index: 1 });
    expect(dropPosition(sections, 'a2', row('B', 'b1'))).toEqual({ sectionId: 'A', index: 1 });
    expect(dropPosition(sections, 'b1', body('B'))).toEqual({ sectionId: 'B', index: 0 });
    expect(dropPosition(sections, 'nope', null)).toBeNull();
  });
});

describe('labels', () => {
  it('names rows by ref and sections by number', () => {
    expect(dragLabel(sections, row('A', 'a3'))).toBe('row 1.c');
    expect(dragLabel(sections, { type: 'section', sectionId: 'B' })).toBe('section 2');
    expect(dragLabel(sections, body('C'))).toBe('the empty section 3');
    expect(dragLabel(sections, null)).toBe('nothing');
  });

  it('finds the section of any target', () => {
    expect(sectionIndexOf(sections, row('B', 'b1'))).toBe(1);
    expect(sectionIndexOf(sections, body('C'))).toBe(2);
    expect(sectionIndexOf(sections, row('B', 'nope'))).toBe(-1);
  });
});

// ---------------------------------------------------------------------------------------------
// Geometry: section A rows at y 100/140/180 (40 high) with its body 100–260 (rows + spare lines),
// a gap with B's header, B's single row at 330 (body 330–450), then the empty C body at 520.
// ---------------------------------------------------------------------------------------------

function rect(top: number, height: number, left = 0, width = 600): ClientRect {
  return { top, left, width, height, bottom: top + height, right: left + width };
}

type Target = { id: UniqueIdentifier; data: DragData; rect: ClientRect };

const rowTargets: Target[] = [
  { id: rowDndId('a1'), data: row('A', 'a1'), rect: rect(100, 40) },
  { id: rowDndId('a2'), data: row('A', 'a2'), rect: rect(140, 40) },
  { id: rowDndId('a3'), data: row('A', 'a3'), rect: rect(180, 40) },
  { id: bodyDndId('A'), data: body('A'), rect: rect(100, 160) },
  { id: rowDndId('b1'), data: row('B', 'b1'), rect: rect(330, 40) },
  { id: bodyDndId('B'), data: body('B'), rect: rect(330, 120) },
  { id: bodyDndId('C'), data: body('C'), rect: rect(520, 40) },
];

function containers(targets: Target[]): DroppableContainer[] {
  return targets.map(({ id, data }) => ({
    id,
    key: String(id),
    data: { current: data },
    disabled: false,
    node: { current: null },
    rect: { current: null },
  }));
}

function collide(
  active: DragData,
  collisionRect: ClientRect,
  pointerY: number | null,
): Collision[] {
  return documentCollisions({
    active: {
      id: 'active',
      data: { current: active },
      rect: { current: { initial: null, translated: null } },
    },
    collisionRect,
    droppableRects: new Map(rowTargets.map((t) => [t.id, t.rect])),
    droppableContainers: containers(rowTargets),
    pointerCoordinates: pointerY === null ? null : { x: 300, y: pointerY },
  });
}

describe('documentCollisions (rows)', () => {
  it('picks the nearest row inside the section under the pointer', () => {
    expect(collide(row('B', 'b1'), rect(150, 40), 165)[0]?.id).toBe(rowDndId('a2'));
    // On a spare line of A: still the nearest of A's rows.
    expect(collide(row('B', 'b1'), rect(235, 40), 250)[0]?.id).toBe(rowDndId('a3'));
  });

  it('targets the body of an empty section', () => {
    expect(collide(row('A', 'a1'), rect(520, 40), 530)[0]?.id).toBe(bodyDndId('C'));
  });

  it('between sections, takes the nearest row or empty section, never a full body', () => {
    const hit = collide(row('A', 'a1'), rect(285, 40), 300)[0]?.id;
    expect(hit).toBe(rowDndId('b1'));
  });

  it('without a pointer (keyboard), uses the section the dragged row overlaps', () => {
    expect(collide(row('A', 'a1'), rect(330, 40), null)[0]?.id).toBe(rowDndId('b1'));
  });
});

describe('documentCollisions (sections)', () => {
  const sectionTargets: Target[] = [
    { id: sectionDndId('A'), data: { type: 'section', sectionId: 'A' }, rect: rect(50, 400) },
    { id: sectionDndId('B'), data: { type: 'section', sectionId: 'B' }, rect: rect(490, 120) },
  ];
  const run = (collisionRect: ClientRect, pointerY: number | null) =>
    documentCollisions({
      active: {
        id: sectionDndId('B'),
        data: { current: { type: 'section', sectionId: 'B' } },
        rect: { current: { initial: null, translated: null } },
      },
      collisionRect,
      droppableRects: new Map(sectionTargets.map((t) => [t.id, t.rect])),
      droppableContainers: containers(sectionTargets),
      pointerCoordinates: pointerY === null ? null : { x: 300, y: pointerY },
    })[0]?.id;

  it('uses the section under the pointer, even near the edge of a tall one', () => {
    // Closer to B's centre than A's, but the pointer is inside A.
    expect(run(rect(420, 44), 440)).toBe(sectionDndId('A'));
  });

  it('uses the overlapped section for the keyboard', () => {
    expect(run(rect(60, 44), null)).toBe(sectionDndId('A'));
  });
});

describe('keyboardCoordinates', () => {
  const press = (
    code: string,
    over: UniqueIdentifier | null,
    active: Target = rowTargets[0]!,
    targets: Target[] = rowTargets,
  ) =>
    keyboardCoordinates({ code, preventDefault: () => undefined } as KeyboardEvent, {
      active: active.id,
      currentCoordinates: { x: 0, y: 0 },
      context: {
        active: {
          id: active.id,
          data: { current: active.data },
          rect: { current: { initial: null, translated: null } },
        },
        over:
          over === null
            ? null
            : { id: over, rect: rect(0, 0), disabled: false, data: { current: undefined } },
        collisionRect: rect(0, 40, 10),
        droppableRects: new Map(targets.map((t) => [t.id, t.rect])),
        droppableContainers: { getEnabled: () => containers(targets) },
      } as never,
    });

  it('steps to the next or previous row in the section', () => {
    expect(press('ArrowDown', null)).toEqual({ x: 10, y: 140 });
    expect(press('ArrowDown', rowDndId('a2'))).toEqual({ x: 10, y: 180 });
    expect(press('ArrowUp', rowDndId('a3'))).toEqual({ x: 10, y: 140 });
  });

  it('entering the next section aims where the row will sit once it has left its own', () => {
    // b1 is at 330; the dragged row (40 high) leaves section A above, so B moves up by 40.
    expect(press('ArrowDown', rowDndId('a3'))).toEqual({ x: 10, y: 290 });
  });

  it('entering the previous section from below lands after its last row', () => {
    const b1 = rowTargets[4]!;
    expect(press('ArrowUp', null, b1)).toEqual({ x: 10, y: 220 });
  });

  it('steps into an empty section, never onto the body of one with rows', () => {
    expect(press('ArrowDown', rowDndId('b1'))).toEqual({ x: 10, y: 480 });
    expect(press('ArrowUp', bodyDndId('C'))).toEqual({ x: 10, y: 370 });
  });

  it('does nothing past the ends or for other keys', () => {
    expect(press('ArrowUp', rowDndId('a1'))).toBeUndefined();
    expect(press('ArrowDown', bodyDndId('C'))).toBeUndefined();
    expect(press('ArrowLeft', rowDndId('a2'))).toBeUndefined();
  });

  it('steps between sections by order', () => {
    const sectionTargets: Target[] = [
      { id: sectionDndId('A'), data: { type: 'section', sectionId: 'A' }, rect: rect(50, 400) },
      { id: sectionDndId('B'), data: { type: 'section', sectionId: 'B' }, rect: rect(490, 120) },
      { id: sectionDndId('C'), data: { type: 'section', sectionId: 'C' }, rect: rect(650, 44) },
    ];
    const b = sectionTargets[1]!;
    expect(press('ArrowDown', null, b, sectionTargets)).toEqual({ x: 10, y: 650 });
    expect(press('ArrowUp', null, b, sectionTargets)).toEqual({ x: 10, y: 50 });
  });
});
