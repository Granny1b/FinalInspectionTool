/**
 * Drag and drop for the checklist document (dnd-kit): sections reorder among themselves; rows
 * reorder within a section and move between sections, empty ones included.
 */
import {
  closestCenter,
  pointerWithin,
  rectIntersection,
  type Active,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
  type KeyboardSensorOptions,
  type Over,
  type PointerSensorOptions,
} from '@dnd-kit/core';
import { rowRef, sectionNumber, type Section } from '@modig/shared';
import { findRow, findSection, type RowPosition } from './ops';

/**
 * What a draggable or droppable is. Each section's rows area ("body") is a droppable of its own,
 * so a row can be dropped into a section that has no rows yet.
 */
export type DragData =
  | { type: 'section'; sectionId: string }
  | { type: 'row'; sectionId: string; itemId: string }
  | { type: 'body'; sectionId: string };

// Prefixed so a section id can never collide with a row id inside one DndContext.
export const sectionDndId = (sectionId: string) => `section:${sectionId}`;
export const rowDndId = (itemId: string) => `row:${itemId}`;
export const bodyDndId = (sectionId: string) => `body:${sectionId}`;

/** Our data on an active/over/droppable entry, or null (dnd-kit types it as `any`). */
export function dragData(entry: Pick<Active | Over, 'data'> | null | undefined): DragData | null {
  const data: unknown = entry?.data.current;
  if (typeof data !== 'object' || data === null || !('type' in data)) return null;
  return data.type === 'section' || data.type === 'row' || data.type === 'body'
    ? (data as DragData)
    : null;
}

// Module constants: new option objects on every render would make dnd-kit rebuild its context,
// which re-renders every row while someone types.

/** A few pixels of movement before a drag starts, so a click on a handle stays a click. */
export const POINTER_SENSOR_OPTIONS: PointerSensorOptions = {
  activationConstraint: { distance: 4 },
};

/**
 * Where a row can land: on any row, or on the body of a section without rows. (The body of a
 * section with rows only tells which section the pointer is in.)
 */
function rowTargets<T extends Pick<Over, 'data'>>(containers: T[]): T[] {
  const sectionsWithRows = new Set(
    containers.flatMap((c) => {
      const data = dragData(c);
      return data?.type === 'row' ? [data.sectionId] : [];
    }),
  );
  return containers.filter((c) => {
    const data = dragData(c);
    return data?.type === 'row' || (data?.type === 'body' && !sectionsWithRows.has(data.sectionId));
  });
}

/**
 * Arrow keys step one place at a time in reading order: to the row (or empty section) after or
 * before the current target, or to the next/previous section. dnd-kit's own getter picks the
 * nearest target geometrically, which skips a row now and then once the page has scrolled.
 */
export const keyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  const step = event.code === 'ArrowDown' ? 1 : event.code === 'ArrowUp' ? -1 : 0;
  const { active, over, collisionRect, droppableRects, droppableContainers } = context;
  if (!step || !active || !collisionRect) return undefined;
  event.preventDefault();

  // Only targets of the dragged kind are enabled (see the `disabled` options of each droppable).
  const enabled = droppableContainers.getEnabled();
  const places = (dragData(active)?.type === 'section' ? enabled : rowTargets(enabled))
    .flatMap((c) => {
      const data = dragData(c);
      const rect = droppableRects.get(c.id);
      return data && rect ? [{ id: c.id, data, rect }] : [];
    })
    .sort((a, b) => a.rect.top - b.rect.top);
  const currentIndex = places.findIndex((place) => place.id === (over?.id ?? active.id));
  const current = places[currentIndex];
  const next = places[currentIndex + step];
  if (!current || !next) return undefined;

  const x = collisionRect.left;
  // A row entering another section: aim where it will actually sit. Moving down, it leaves the
  // section above, so everything below moves up by its height; moving up, it goes after the
  // previous section's last row (see crossSectionTarget).
  if (next.data.type !== 'section' && next.data.sectionId !== current.data.sectionId) {
    if (step > 0) return { x, y: next.rect.top - collisionRect.height };
    if (next.data.type === 'row') return { x, y: next.rect.bottom };
  }
  return { x, y: next.rect.top };
};

export const KEYBOARD_SENSOR_OPTIONS: KeyboardSensorOptions = {
  coordinateGetter: keyboardCoordinates,
  // Past the middle of the screen an arrow key scrolls the page instead of moving the item. A
  // smooth scroll would leave the drop target behind for a moment, so a quick Space dropped it
  // one place short.
  scrollBehavior: 'auto',
};

/**
 * Sections: the one under the pointer; for the keyboard, the one the dragged header overlaps.
 * (Sections are tall, so "closest centre" would pick the wrong one near their edges.)
 */
const sectionCollisions: CollisionDetection = (args) => {
  const sections = args.droppableContainers.filter((c) => dragData(c)?.type === 'section');
  const narrowed = { ...args, droppableContainers: sections };
  const underPointer = pointerWithin(narrowed);
  if (underPointer.length > 0) return underPointer;
  const overlapping = rectIntersection(narrowed);
  return overlapping.length > 0 ? overlapping : closestCenter(narrowed);
};

/**
 * Rows: find the section body under the pointer (or, for the keyboard, the one the dragged row
 * overlaps most), then the nearest row in it. An empty section's body is the target itself.
 */
const rowCollisions: CollisionDetection = (args) => {
  const bodies = args.droppableContainers.filter((c) => dragData(c)?.type === 'body');
  const underPointer = pointerWithin({ ...args, droppableContainers: bodies });
  const [body] =
    underPointer.length > 0
      ? underPointer
      : rectIntersection({ ...args, droppableContainers: bodies });
  // Between sections (on a header, in a gap): the nearest row or empty section.
  if (!body)
    return closestCenter({ ...args, droppableContainers: rowTargets(args.droppableContainers) });

  const sectionId = dragData(bodies.find((c) => c.id === body.id))?.sectionId;
  const rows = args.droppableContainers.filter((c) => {
    const data = dragData(c);
    return data?.type === 'row' && data.sectionId === sectionId;
  });
  return rows.length > 0 ? closestCenter({ ...args, droppableContainers: rows }) : [body];
};

/** Rows and sections never collide with each other's targets. */
export const documentCollisions: CollisionDetection = (args) =>
  dragData(args.active)?.type === 'section' ? sectionCollisions(args) : rowCollisions(args);

/** Index of the section a row, body or section target belongs to (-1 if unknown). */
export function sectionIndexOf(sections: Section[], data: DragData): number {
  return data.type === 'row'
    ? (findRow(sections, data.itemId)?.sectionIndex ?? -1)
    : findSection(sections, data.sectionId);
}

/**
 * While a row is dragged over another section, where it goes there: before or after the hovered
 * row (`below`), or at the end of an empty section. Null while it stays in its own section;
 * sorting there is visual until the drop.
 */
export function crossSectionTarget(
  sections: Section[],
  itemId: string,
  over: DragData,
  below: boolean,
): RowPosition | null {
  const from = findRow(sections, itemId);
  if (!from || over.type === 'section') return null;
  const sectionIndex = sectionIndexOf(sections, over);
  const target = sections[sectionIndex];
  if (!target || sectionIndex === from.sectionIndex) return null;
  const overRow = over.type === 'row' ? findRow(sections, over.itemId) : null;
  const index = overRow ? overRow.rowIndex + (below ? 1 : 0) : target.items.length;
  return { sectionId: target.id, index };
}

/** On drop: within its (current) section the row takes the place of the row it is over. */
export function dropPosition(
  sections: Section[],
  itemId: string,
  over: DragData | null,
): RowPosition | null {
  const from = findRow(sections, itemId);
  const section = from && sections[from.sectionIndex];
  if (!from || !section) return null;
  const to = over?.type === 'row' ? findRow(sections, over.itemId) : null;
  const index = to && to.sectionIndex === from.sectionIndex ? to.rowIndex : from.rowIndex;
  return { sectionId: section.id, index };
}

/** "row 2.c" / "section 3" for screen reader announcements. */
export function dragLabel(sections: Section[], data: DragData | null): string {
  if (data?.type === 'row') {
    const at = findRow(sections, data.itemId);
    return at ? `row ${rowRef(at.sectionIndex, at.rowIndex)}` : 'row';
  }
  if (!data) return 'nothing';
  const number = sectionNumber(findSection(sections, data.sectionId));
  return data.type === 'section' ? `section ${number}` : `the empty section ${number}`;
}
