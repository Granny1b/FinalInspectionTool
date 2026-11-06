import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { formatHours, sectionNumber, type TemplateSummary } from '@modig/shared';
import clsx from 'clsx';
import { GripVertical, Plus } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router';
import { buttonClasses } from '../../components/buttonClasses';
import { formatDate } from '../../lib/format';
import { usePersonName } from '../../lib/usePeople';
import { Badge, PublishedBadge } from '../templates/Badge';
import { qualityCheckHref } from '../templates/queries';

type Props = {
  /** In the order they are done. */
  checks: TemplateSummary[];
  /** Admins also see which drafts have unpublished changes, and the New quality check card. */
  isAdmin: boolean;
  onNew: () => void;
  /**
   * Admins: the new order after a card was dragged (or moved with the keyboard) by its handle.
   * Without it the cards stay where they are.
   */
  onReorder?: (ids: string[]) => void;
};

/**
 * A machine's quality checks as cards, numbered in the order they are done on a machine: the
 * title ("Quality check – Pre start up"), who owns and wrote it, its revision, its sections, and
 * its rows, time and last edit. The whole card opens it. Admins drag a card by its handle to
 * change the order, and get a dashed card for another one at the end.
 */
export function QualityCheckCards({ checks, isAdmin, onNew, onReorder }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = checks.map((check) => check.id);
  const titleOf = (id: unknown) =>
    checks.find((check) => check.id === id)?.name || 'Untitled quality check';
  const placeOf = (id: unknown) => ids.indexOf(String(id)) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${titleOf(active.id)}, number ${placeOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `${titleOf(active.id)} is over number ${placeOf(over.id)}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over ? `${titleOf(active.id)} is now number ${placeOf(over.id)}.` : undefined,
    onDragCancel: ({ active }) => `${titleOf(active.id)} stays where it was.`,
  };
  function onDragEnd({ active, over }: DragEndEvent) {
    if (!onReorder || !over || active.id === over.id) return;
    onReorder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  }

  const cards = (
    <ul className="grid gap-4 lg:grid-cols-2">
      {checks.map((check, index) => (
        <QualityCheckCard
          key={check.id}
          check={check}
          number={index + 1}
          isAdmin={isAdmin}
          sortable={Boolean(onReorder)}
        />
      ))}
      {isAdmin && (
        <li>
          <button
            type="button"
            onClick={onNew}
            className="flex size-full min-h-56 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-ink-400 p-5 text-center text-ink-600 transition-colors hover:border-brand-500 hover:bg-brand-50 hover:text-brand-800"
          >
            <Plus size={24} aria-hidden="true" className="text-brand-600" />
            <span className="font-semibold text-brand-700">New quality check</span>
            <span className="max-w-64 text-sm">
              Another in-process check along the build of this machine, such as Pre start up.
            </span>
          </button>
        </li>
      )}
    </ul>
  );
  if (!onReorder) return cards;
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            'To change the order, press Space or Enter on the handle, move the card with the arrow keys, then press Space or Enter to drop it, or Escape to cancel.',
        },
      }}
    >
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        {cards}
      </SortableContext>
    </DndContext>
  );
}

type CardProps = {
  check: TemplateSummary;
  /** Its place in the order they are done (1, 2…). */
  number: number;
  isAdmin: boolean;
  sortable: boolean;
};

function QualityCheckCard({ check, number, isAdmin, sortable }: CardProps) {
  if (!sortable) return <CardBody check={check} number={number} isAdmin={isAdmin} />;
  return <SortableCard check={check} number={number} isAdmin={isAdmin} />;
}

function SortableCard({ check, number, isAdmin }: Omit<CardProps, 'sortable'>) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: check.id });
  return (
    <CardBody
      check={check}
      number={number}
      isAdmin={isAdmin}
      itemRef={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      dragging={isDragging}
      handle={
        // Above the title's link, which covers the card. `touch-none` lets a finger drag it.
        <button
          ref={setActivatorNodeRef}
          type="button"
          aria-label={`Move ${check.name || 'Untitled quality check'}`}
          {...attributes}
          {...listeners}
          className="relative z-10 -my-1 -ml-2 flex h-8 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded text-ink-500 hover:bg-ink-100 hover:text-ink-700 active:cursor-grabbing pointer-coarse:h-10 pointer-coarse:w-9"
        >
          <GripVertical size={16} aria-hidden="true" />
        </button>
      }
    />
  );
}

type BodyProps = Omit<CardProps, 'sortable'> & {
  itemRef?: (element: HTMLElement | null) => void;
  style?: CSSProperties;
  dragging?: boolean;
  handle?: ReactNode;
};

function CardBody({ check, number, isAdmin, itemRef, style, dragging, handle }: BodyProps) {
  const personName = usePersonName();
  const front = check.quality;
  const meta = [front?.department].filter(Boolean);
  const sections = check.sectionTitles ?? [];
  return (
    <li
      ref={itemRef}
      style={style}
      // The title's link covers the card; the outline shows where keyboard focus is.
      className={clsx(
        'relative flex flex-col gap-4 rounded-lg border border-ink-200 bg-surface p-5 shadow-xs outline-brand-600 transition-colors hover:border-ink-300 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2',
        dragging && 'z-20 opacity-80 shadow-lg ring-1 ring-brand-500/30',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-start gap-2">
          {handle}
          <span
            aria-hidden="true"
            // Round and in the brand colour, apart from the sections' grey numbered chips.
            className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700 tabular-nums ring-1 ring-brand-200 ring-inset"
          >
            {number}
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold wrap-break-word text-ink-900">
              <Link
                to={qualityCheckHref(check.parentId ?? '', check.id)}
                className="outline-none after:absolute after:inset-0"
              >
                {check.name || 'Untitled quality check'}
              </Link>
            </h2>
            {meta.length > 0 && <p className="mt-0.5 text-sm text-ink-500">{meta.join(' · ')}</p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <PublishedBadge revision={check.publishedRevision} />
          {isAdmin && check.hasUnpublishedChanges && check.publishedRevision !== null && (
            <Badge tone="brand">Unpublished changes</Badge>
          )}
        </div>
      </div>

      {sections.length > 0 ? (
        <ol aria-label="Sections" className="flex flex-wrap gap-1.5">
          {sections.map((title, index) => (
            <li
              key={index}
              className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-md bg-ink-100 px-2.5 text-sm text-ink-800"
            >
              <span className="font-semibold tabular-nums">{sectionNumber(index)}</span>
              <span className="truncate">{title || 'Untitled section'}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-ink-500">No sections yet.</p>
      )}

      <div className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t border-ink-100 pt-3">
        <dl className="grid grid-cols-3 gap-x-6 text-xs">
          <div>
            <dt className="text-ink-500">Rows</dt>
            <dd className="mt-0.5 text-sm font-semibold text-ink-900 tabular-nums">
              {check.itemCount}
            </dd>
          </div>
          <div>
            <dt className="text-ink-500">Time</dt>
            <dd className="mt-0.5 text-sm font-semibold text-ink-900 tabular-nums">
              {formatHours(check.totalHours ?? 0)}
            </dd>
          </div>
          <div>
            <dt className="text-ink-500">Last edited</dt>
            <dd
              className="mt-0.5 text-sm font-semibold whitespace-nowrap text-ink-900 tabular-nums"
              title={personName(check.updatedBy)}
            >
              {formatDate(check.updatedAt)}
            </dd>
          </div>
        </dl>
        {/* The card is the link; this only shows it, so it is no second stop. */}
        <span aria-hidden="true" className={buttonClasses('secondary', 'h-8')}>
          Open
        </span>
      </div>
    </li>
  );
}
