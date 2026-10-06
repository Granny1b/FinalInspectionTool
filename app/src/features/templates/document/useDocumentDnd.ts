import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DndContextProps,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import type { Section } from '@modig/shared';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  crossSectionTarget,
  documentCollisions,
  dragData,
  dragLabel,
  dropPosition,
  KEYBOARD_SENSOR_OPTIONS,
  POINTER_SENSOR_OPTIONS,
  sectionIndexOf,
} from './dnd';
import { findRow, findSection, moveRow } from './ops';
import type { DocumentActions } from './useDocumentActions';

/**
 * A row drag works on a copy of the sections, so moving between sections can be shown live
 * without saving each step; the drop applies one move to the latest sections. A dragged section
 * folds to its header, so the sections around it only make room for a header. (Folding them all
 * moved the dragged header away from the pointer whenever the page could not scroll to follow.)
 */
export type DragState =
  { kind: 'row'; itemId: string; working: Section[] } | { kind: 'section'; sectionId: string };

/** What is being dragged, if anything. */
export type DragKind = DragState['kind'] | null;

const INSTRUCTIONS =
  'To move a section or row, press Space or Enter on its handle, move it with the arrow keys, ' +
  'then press Space or Enter to drop it, or Escape to cancel.';

export function useDocumentDnd(
  sections: Section[],
  actions: Pick<DocumentActions, 'moveRowTo' | 'moveSectionTo'>,
) {
  const [drag, setDragState] = useState<DragState | null>(null);
  // Handlers and announcements read the drag synchronously, before React re-renders.
  const dragRef = useRef<DragState | null>(null);
  const latestSections = useRef(sections);
  /** Announced after a drop or cancel, when the drag state is already gone. */
  const endMessage = useRef('');

  useLayoutEffect(() => {
    latestSections.current = sections;
  });

  const setDrag = (next: DragState | null) => {
    dragRef.current = next;
    setDragState(next);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, POINTER_SENSOR_OPTIONS),
    useSensor(KeyboardSensor, KEYBOARD_SENSOR_OPTIONS),
  );

  const accessibility = useMemo<DndContextProps['accessibility']>(() => {
    const shown = () => {
      const state = dragRef.current;
      return state?.kind === 'row' ? state.working : latestSections.current;
    };
    const announcements: Announcements = {
      onDragStart: ({ active }) => `Picked up ${dragLabel(shown(), dragData(active))}.`,
      onDragOver: ({ active, over }) => {
        const what = dragLabel(shown(), dragData(active));
        return over
          ? `${capitalise(what)} is over ${dragLabel(shown(), dragData(over))}.`
          : `${capitalise(what)} is not over a place to drop.`;
      },
      onDragEnd: () => endMessage.current,
      onDragCancel: () => endMessage.current,
    };
    return { announcements, screenReaderInstructions: { draggable: INSTRUCTIONS } };
  }, []);

  function onDragStart({ active }: DragStartEvent) {
    const data = dragData(active);
    if (data?.type === 'row') {
      setDrag({ kind: 'row', itemId: data.itemId, working: latestSections.current });
    } else if (data?.type === 'section') {
      setDrag({ kind: 'section', sectionId: data.sectionId });
    }
  }

  function onDragOver({ active, over, activatorEvent }: DragOverEvent) {
    const state = dragRef.current;
    const overData = dragData(over);
    if (state?.kind !== 'row' || !over || !overData) return;
    // The keyboard steps one row at a time: entering a section from below lands after its last
    // row, from above before its first. The pointer goes by where the dragged row is.
    const draggedTop = active.rect.current.translated?.top ?? 0;
    const below =
      activatorEvent instanceof KeyboardEvent
        ? sectionIndexOf(state.working, overData) <
          (findRow(state.working, state.itemId)?.sectionIndex ?? -1)
        : draggedTop > over.rect.top + over.rect.height / 2;
    const target = crossSectionTarget(state.working, state.itemId, overData, below);
    if (!target) return;
    setDrag({ ...state, working: moveRow(state.working, state.itemId, target) });
  }

  function onDragEnd({ over }: DragEndEvent) {
    const state = dragRef.current;
    if (state?.kind === 'row') {
      // Even when dropped outside any target, keep what the user sees: the row may already be in
      // another section.
      const position = dropPosition(state.working, state.itemId, dragData(over));
      if (position) {
        const placed = moveRow(state.working, state.itemId, position);
        const row = { type: 'row', sectionId: position.sectionId, itemId: state.itemId } as const;
        endMessage.current = `Dropped as ${dragLabel(placed, row)}.`;
        actions.moveRowTo(state.itemId, position);
      }
    } else if (state?.kind === 'section') {
      const overData = dragData(over);
      const index =
        overData?.type === 'section'
          ? findSection(latestSections.current, overData.sectionId)
          : findSection(latestSections.current, state.sectionId);
      endMessage.current = `Section dropped at position ${index + 1}.`;
      if (index >= 0) actions.moveSectionTo(state.sectionId, index);
    }
    setDrag(null);
  }

  function onDragCancel() {
    const state = dragRef.current;
    endMessage.current = `Cancelled. The ${state?.kind ?? 'item'} is back in its place.`;
    setDrag(null);
  }

  const contextProps: DndContextProps = {
    sensors,
    collisionDetection: documentCollisions,
    accessibility,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel,
  };
  return {
    drag,
    /** What to render: the working copy while a row is dragged. */
    shown: drag?.kind === 'row' ? drag.working : sections,
    contextProps,
  };
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
