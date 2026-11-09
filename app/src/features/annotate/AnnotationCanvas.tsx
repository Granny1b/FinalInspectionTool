import type { Annotation } from '@modig/shared';
import clsx from 'clsx';
import type { Group as KonvaGroup } from 'konva/lib/Group';
import type { Node as KonvaNode } from 'konva/lib/Node';
import type { Rect as KonvaRect } from 'konva/lib/shapes/Rect';
import type { Transformer as KonvaTransformer } from 'konva/lib/shapes/Transformer';
import type { Stage as KonvaStage } from 'konva/lib/Stage';
import type { Vector2d } from 'konva/lib/types';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import {
  Arrow,
  Circle,
  Ellipse,
  Group,
  Image,
  Layer,
  Line,
  Rect,
  Stage,
  Text,
  Transformer,
} from 'react-konva/lib/ReactKonvaCore';
import './konva';
import type { Item, TextDraft } from './editorState';
import {
  annotationBounds,
  clampMove,
  extendStroke,
  limitBox,
  moveArrowEnd,
  shapeFromDrag,
  strokeFromPoints,
  toFraction,
  transformAnnotation,
  type ArrowEnd,
  type Point,
  type Size,
} from './geometry';
import { shapeSpecs, type ShapeSpec } from './style';
import { TextLabelInput } from './TextLabelInput';
import type { Tool } from './tools';

/** Lines are hit-tested at least this wide (screen pixels), so a finger can pick a thin one. */
const HIT_PX = 24;
/** Brand 600, as the app's focus ring. */
const SELECTION_COLOR = '#0b7db3';

/**
 * The selection's handles in screen pixels: a square on each corner and side of a box and a round
 * one to turn it, a dot on each end of an arrow. Larger for a finger than for a mouse, and easier
 * to hit than they look. The turning handle sits `turnOffset` out from the box.
 */
const HANDLES = {
  fine: { size: 10, hitStroke: 10, radius: 6, hitRadius: 12, turnOffset: 24 },
  coarse: { size: 16, hitStroke: 24, radius: 9, hitRadius: 24, turnOffset: 34 },
} as const;

/** A turn snaps to straight and to every 45° within 5°, so a mark is easily put straight again. */
const TURN_SNAPS = [0, 45, 90, 135, 180, 225, 270, 315];
const TURN_SNAP_TOLERANCE = 5;
/**
 * Where the turning handle goes, in this order (degrees from the top of the mark): above it,
 * else below, right or left, the first that is on the photo, so a mark at the top edge can still
 * be turned.
 */
const TURN_HANDLE_PLACES = [0, 180, 90, 270];

const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
const CORNERS_AND_SIDES = [
  ...CORNERS,
  'top-center',
  'middle-left',
  'middle-right',
  'bottom-center',
];

type ArrowMark = Extract<Annotation, { kind: 'arrow' }>;

/**
 * How each kind of mark is resized by its handles. Boxes and circles by any side or corner; a
 * label and a freehand line by their corners keeping their proportions, so text and handwriting
 * never stretch. All of them turn. An arrow has a handle on each end instead (which turns it).
 */
const RESIZING: Record<
  Exclude<Annotation['kind'], 'arrow'>,
  { anchors: string[]; keepRatio: boolean }
> = {
  rect: { anchors: CORNERS_AND_SIDES, keepRatio: false },
  ellipse: { anchors: CORNERS_AND_SIDES, keepRatio: false },
  text: { anchors: CORNERS, keepRatio: true },
  freehand: { anchors: CORNERS, keepRatio: true },
};

/** Konva names of an arrow's end handles. */
const END_NAMES: Record<ArrowEnd, string> = { tail: 'arrow-tail', tip: 'arrow-tip' };

type DrawTool = Exclude<Tool, 'select'>;
type Gesture =
  | { kind: 'draw'; pointerId: number; tool: DrawTool; start: Point; points: number[] }
  | {
      kind: 'arrow-end';
      pointerId: number;
      id: number;
      end: ArrowEnd;
      arrow: ArrowMark;
      /** The arrow as last shown, long enough to keep. */
      latest: ArrowMark | null;
    };

type Props = {
  image: HTMLImageElement;
  /** The photo's own size in pixels: shapes are laid out in it. */
  size: Size;
  /** Its size on screen. */
  shown: Size;
  items: readonly Item[];
  tool: Tool;
  color: string;
  selectedId: number | null;
  /** A label being typed: shown as a text field over the photo instead of its shape. */
  text: TextDraft | null;
  disabled: boolean;
  onSelect: (id: number | null) => void;
  onAdd: (annotation: Annotation) => void;
  onMove: (id: number, dx: number, dy: number) => void;
  /** A mark resized by its handles, or an arrow's end moved. */
  onReshape: (id: number, annotation: Annotation) => void;
  onPlaceText: (at: Point) => void;
  onEditText: (id: number) => void;
  onTextChange: (value: string) => void;
  onTextCommit: () => void;
  onTextCancel: () => void;
};

/**
 * The photo with its marks. A press on a mark picks it with any tool: dragging moves it, kept on
 * the photo, and the selected mark has handles to resize and turn it (an arrow, one on each end). Drawing
 * tools only pick a mark by its line, so a box can still be drawn inside another; the select tool
 * also picks a box or circle by its inside. A press anywhere else clears the selection and, with
 * a drawing tool, draws the next mark (mouse, finger or pen). Pointer positions become fractions
 * of the photo at once; shapes are drawn in photo pixels, scaled to fit.
 */
export function AnnotationCanvas({
  image,
  size,
  shown,
  items,
  tool,
  color,
  selectedId,
  text,
  disabled,
  onSelect,
  onAdd,
  onMove,
  onReshape,
  onPlaceText,
  onEditText,
  onTextChange,
  onTextCommit,
  onTextCancel,
}: Props) {
  const [draft, setDraft] = useState<Annotation | null>(null);
  /** An arrow whose end is being dragged, as it is shown meanwhile. */
  const [reshaping, setReshaping] = useState<{ id: number; annotation: ArrowMark } | null>(null);
  const [hovering, setHovering] = useState(false);
  const [surface, setSurface] = useState<HTMLDivElement | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const stage = useRef<KonvaStage>(null);
  const transformer = useRef<KonvaTransformer>(null);
  const groups = useRef(new Map<number, KonvaGroup>());
  /** The handles are turning the mark, not resizing it. */
  const turning = useRef(false);
  const selecting = tool === 'select' && !disabled;
  const scale = { x: shown.width / size.width, y: shown.height / size.height };
  const hiddenId = text?.id ?? null;
  const handles = HANDLES[coarsePointer() ? 'coarse' : 'fine'];
  const selected = disabled
    ? undefined
    : items.find((item) => item.id === selectedId && item.id !== hiddenId);
  const resizing =
    selected && selected.annotation.kind !== 'arrow' ? RESIZING[selected.annotation.kind] : null;
  const shownArrow =
    selected?.annotation.kind === 'arrow'
      ? reshaping?.id === selected.id
        ? reshaping.annotation
        : selected.annotation
      : null;

  // The handles follow the selected mark, also after it moved or changed. They hold its shapes
  // (its dark outline, if it has one, and the mark), not its group, so they turn with it. An
  // arrow has its own.
  const handled = resizing ? selected?.id : undefined;
  useEffect(() => {
    const tr = transformer.current;
    if (!tr) return;
    const group = handled === undefined ? undefined : groups.current.get(handled);
    tr.nodes(group ? group.getChildren().slice() : []);
    if (!group) return;
    // The turning handle where it is on the photo, so it can be reached.
    const room = { x0: 0, y0: 0, x1: shown.width, y1: shown.height };
    for (const angle of TURN_HANDLE_PLACES) {
      tr.rotateAnchorAngle(angle);
      tr.forceUpdate();
      const at = tr.findOne('.rotater')?.getAbsolutePosition();
      if (at && at.x >= room.x0 && at.x <= room.x1 && at.y >= room.y0 && at.y <= room.y1) return;
    }
    tr.rotateAnchorAngle(TURN_HANDLE_PLACES[0]!);
    tr.forceUpdate();
  }, [handled, items, shown]);

  function position(event: PointerEvent<HTMLElement>): Point {
    const box = event.currentTarget.getBoundingClientRect();
    return toFraction({ x: event.clientX - box.left, y: event.clientY - box.top }, shown);
  }

  /** The mark a Konva shape belongs to, or null for a handle. */
  function markOf(node: KonvaNode): number | null {
    for (const [id, group] of groups.current) {
      if (group === node || group.isAncestorOf(node)) return id;
    }
    return null;
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    // Only presses on the photo itself; the label field handles its own.
    if (!(event.target instanceof HTMLCanvasElement)) return;
    // Focus here, so Delete and Ctrl+Z reach the editor and a label being typed is committed.
    event.currentTarget.focus({ preventScroll: true });
    if (disabled || gesture.current || event.button !== 0) return;
    const box = event.currentTarget.getBoundingClientRect();
    const hit = stage.current?.getIntersection({
      x: event.clientX - box.left,
      y: event.clientY - box.top,
    });
    if (hit) {
      const end = (Object.keys(END_NAMES) as ArrowEnd[]).find((name) =>
        hit.hasName(END_NAMES[name]),
      );
      if (end && selected?.annotation.kind === 'arrow') {
        event.currentTarget.setPointerCapture(event.pointerId);
        gesture.current = {
          kind: 'arrow-end',
          pointerId: event.pointerId,
          id: selected.id,
          end,
          arrow: selected.annotation,
          latest: null,
        };
        return;
      }
      // A mark is picked, and Konva drags it from here; a box's handle resizes it.
      const id = markOf(hit);
      if (id !== null) onSelect(id);
      return;
    }
    onSelect(null);
    if (tool === 'select') return;
    const start = position(event);
    // Keep the pointer while it leaves the photo: the mark then ends at the edge.
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      kind: 'draw',
      pointerId: event.pointerId,
      tool,
      start,
      points: [start.x, start.y],
    };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (current?.pointerId !== event.pointerId) return;
    const point = position(event);
    if (current.kind === 'arrow-end') {
      // Too short an arrow isn't shown: it stays as it last was until the end moves away.
      const next = moveArrowEnd(current.arrow, current.end, point, shown);
      if (!next) return;
      current.latest = next;
      setReshaping({ id: current.id, annotation: next });
    } else if (current.tool === 'freehand') {
      current.points = extendStroke(current.points, point, shown);
      setDraft({ kind: 'freehand', points: current.points, color });
    } else if (current.tool !== 'text') {
      setDraft(shapeFromDrag(current.tool, current.start, point, color, shown));
    }
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (current?.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (current.kind === 'arrow-end') {
      const next =
        moveArrowEnd(current.arrow, current.end, position(event), shown) ?? current.latest;
      setReshaping(null);
      if (next) onReshape(current.id, next);
      return;
    }
    setDraft(null);
    if (current.tool === 'text') {
      onPlaceText(current.start);
      return;
    }
    const end = position(event);
    const annotation =
      current.tool === 'freehand'
        ? strokeFromPoints(extendStroke(current.points, end, shown), color, shown)
        : shapeFromDrag(current.tool, current.start, end, color, shown);
    if (annotation) onAdd(annotation);
  }

  function onPointerCancel(event: PointerEvent<HTMLDivElement>) {
    if (gesture.current?.pointerId !== event.pointerId) return;
    gesture.current = null;
    setDraft(null);
    setReshaping(null);
  }

  /** Keeps a dragged mark on the photo (positions in screen pixels). */
  function boundMove(annotation: Annotation, target: Vector2d): Vector2d {
    const move = clampMove(
      annotationBounds(annotation, size.width / size.height),
      target.x / shown.width,
      target.y / shown.height,
    );
    return { x: move.x * shown.width, y: move.y * shown.height };
  }

  /**
   * A resize or turn is done: the handles scaled, turned and moved the mark's shapes. Store that
   * in the annotation's own coordinates and draw the shapes from it again, unscaled, so the line
   * keeps its width.
   */
  function onTransformEnd() {
    const nodes = transformer.current?.nodes() ?? [];
    const mark = nodes.at(-1);
    if (!mark || !selected) return;
    // Konva's turn leaves crumbs in the scale (a box 0.05 % smaller): a turn keeps the size.
    const changed = transformAnnotation(
      selected.annotation,
      {
        x: mark.x(),
        y: mark.y(),
        scaleX: turning.current ? 1 : mark.scaleX(),
        scaleY: turning.current ? 1 : mark.scaleY(),
        rotation: mark.rotation(),
      },
      size,
    );
    const specs = shapeSpecs(changed, size);
    nodes.forEach((node, index) =>
      node.setAttrs({ ...specs[index]?.config, scaleX: 1, scaleY: 1 }),
    );
    onReshape(selected.id, changed);
  }

  /** Back from typing a label: the keys go to the editor again. */
  function refocus() {
    surface?.focus({ preventScroll: true });
  }

  const hover = {
    onPointerEnter: () => setHovering(true),
    onPointerLeave: () => setHovering(false),
  };

  return (
    <div
      ref={setSurface}
      tabIndex={-1}
      role="img"
      aria-label={items.length === 1 ? 'Photo with 1 mark' : `Photo with ${items.length} marks`}
      data-annotation-canvas=""
      data-selected-kind={selected?.annotation.kind}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onPointerCancel}
      style={{ width: shown.width, height: shown.height }}
      className={clsx(
        // No scrolling or zooming the page while drawing with a finger or pen. White behind a
        // transparent PNG, as in the stored photo and the flattened copy.
        'relative touch-none bg-paper shadow-lg outline-none select-none',
        !disabled &&
          (hovering
            ? 'cursor-move'
            : !selecting && (tool === 'text' ? 'cursor-text' : 'cursor-crosshair')),
      )}
    >
      <Stage ref={stage} width={shown.width} height={shown.height}>
        <Layer scaleX={scale.x} scaleY={scale.y}>
          <Image image={image} width={size.width} height={size.height} listening={false} />
          {items.map((item) =>
            item.id === hiddenId ? null : (
              <Group
                key={item.id}
                ref={(node) => {
                  if (!node) return;
                  groups.current.set(item.id, node);
                  return () => {
                    groups.current.delete(item.id);
                  };
                }}
                listening={!disabled}
                draggable={!disabled}
                dragBoundFunc={(target) => boundMove(item.annotation, target)}
                onDragStart={() => onSelect(item.id)}
                onDragEnd={(event) => {
                  // The group was dragged as a whole; store the move and put it back at the
                  // origin, as the annotation's own coordinates now carry it.
                  const node = event.target;
                  const dx = node.x() / size.width;
                  const dy = node.y() / size.height;
                  node.position({ x: 0, y: 0 });
                  onMove(item.id, dx, dy);
                }}
                onDblClick={() => item.annotation.kind === 'text' && onEditText(item.id)}
                onDblTap={() => item.annotation.kind === 'text' && onEditText(item.id)}
                {...hover}
              >
                <AnnotationShapes
                  specs={shapeSpecs(
                    reshaping?.id === item.id ? reshaping.annotation : item.annotation,
                    size,
                  )}
                  minHitWidth={HIT_PX / scale.x}
                  hitInside={selecting}
                />
              </Group>
            ),
          )}
          {draft && (
            <Group listening={false}>
              <AnnotationShapes specs={shapeSpecs(draft, size)} minHitWidth={0} hitInside />
            </Group>
          )}
        </Layer>
        {/* The selection, unscaled: handles keep their size in screen pixels. */}
        <Layer>
          <Transformer
            ref={transformer}
            listening={!disabled}
            resizeEnabled={Boolean(resizing)}
            enabledAnchors={resizing?.anchors ?? []}
            keepRatio={resizing?.keepRatio ?? false}
            rotateEnabled={Boolean(resizing)}
            rotationSnaps={TURN_SNAPS}
            rotationSnapTolerance={TURN_SNAP_TOLERANCE}
            rotateAnchorOffset={handles.turnOffset}
            flipEnabled={false}
            // Handles on the mark's outline, not its line's outer edge: a box including the line
            // would scale the outline by a little less than the handle moved.
            ignoreStroke
            boundBoxFunc={(old, next) => limitBox(old, next, shown, resizing?.keepRatio ?? false)}
            onTransformStart={() => {
              turning.current = transformer.current?.getActiveAnchor() === 'rotater';
            }}
            onTransformEnd={onTransformEnd}
            borderStroke={SELECTION_COLOR}
            borderStrokeWidth={1.5}
            borderDash={[6, 4]}
            padding={6}
            anchorSize={handles.size}
            anchorStroke={SELECTION_COLOR}
            anchorStrokeWidth={1.5}
            anchorFill="#ffffff"
            anchorCornerRadius={2}
            anchorStyleFunc={(anchor: KonvaRect) => {
              anchor.hitStrokeWidth(handles.hitStroke);
              // The turning handle is round, the others square.
              if (anchor.hasName('rotater')) anchor.cornerRadius(handles.size / 2);
            }}
          />
          {shownArrow &&
            (['tail', 'tip'] as const).map((end) => {
              const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = shownArrow.points;
              const [x, y] = end === 'tail' ? [x1, y1] : [x2, y2];
              return (
                <Circle
                  key={end}
                  name={END_NAMES[end]}
                  x={x * shown.width}
                  y={y * shown.height}
                  radius={handles.radius}
                  fill="#ffffff"
                  stroke={SELECTION_COLOR}
                  strokeWidth={1.5}
                  // Hit as a circle of hitRadius: the stroke's hit width reaches out from it.
                  hitStrokeWidth={2 * (handles.hitRadius - handles.radius)}
                  shadowColor="#000000"
                  shadowOpacity={0.3}
                  shadowBlur={3}
                  {...hover}
                />
              );
            })}
        </Layer>
      </Stage>
      {text && (
        <TextLabelInput
          draft={text}
          shown={shown}
          onChange={onTextChange}
          onCommit={onTextCommit}
          onDone={(commit) => {
            if (commit) onTextCommit();
            else onTextCancel();
            refocus();
          }}
        />
      )}
    </div>
  );
}

/** Fingers and pens get larger handles (as the toolbar's 44 px buttons). */
function coarsePointer(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
}

/**
 * An annotation's shapes (a light line's outline, then the mark), bottom first. With `hitInside`
 * a box or circle is picked by its inside too, otherwise only by its line.
 */
function AnnotationShapes({
  specs,
  minHitWidth,
  hitInside,
}: {
  specs: ShapeSpec[];
  minHitWidth: number;
  hitInside: boolean;
}) {
  return specs.map((spec, index) => (
    <AnnotationShape key={index} spec={spec} minHitWidth={minHitWidth} hitInside={hitInside} />
  ));
}

function AnnotationShape({
  spec,
  minHitWidth,
  hitInside,
}: {
  spec: ShapeSpec;
  minHitWidth: number;
  hitInside: boolean;
}) {
  if (spec.type === 'Text') return <Text {...spec.config} />;
  const hitStrokeWidth = Math.max(minHitWidth, spec.config.strokeWidth ?? 0);
  switch (spec.type) {
    case 'Arrow':
      return <Arrow {...spec.config} hitStrokeWidth={hitStrokeWidth} />;
    case 'Line':
      return <Line {...spec.config} hitStrokeWidth={hitStrokeWidth} />;
    // Konva fills a shape's hit area even without a fill: turning the fill off leaves the line.
    // These marks have no fill, so they look the same either way.
    case 'Rect':
      return <Rect {...spec.config} hitStrokeWidth={hitStrokeWidth} fillEnabled={hitInside} />;
    case 'Ellipse':
      return <Ellipse {...spec.config} hitStrokeWidth={hitStrokeWidth} fillEnabled={hitInside} />;
  }
}
