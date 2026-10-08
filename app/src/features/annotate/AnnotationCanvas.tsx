import type { Annotation } from '@modig/shared';
import clsx from 'clsx';
import type { Group as KonvaGroup } from 'konva/lib/Group';
import type { Transformer as KonvaTransformer } from 'konva/lib/shapes/Transformer';
import type { Vector2d } from 'konva/lib/types';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import {
  Arrow,
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
  shapeFromDrag,
  strokeFromPoints,
  toFraction,
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

type DrawTool = Exclude<Tool, 'select'>;
type Gesture = { pointerId: number; tool: DrawTool; start: Point; points: number[] };

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
  onPlaceText: (at: Point) => void;
  onEditText: (id: number) => void;
  onTextChange: (value: string) => void;
  onTextCommit: () => void;
  onTextCancel: () => void;
};

/**
 * The photo with its marks. Drawing tools turn a pointer gesture (mouse, finger or pen) into an
 * annotation; the select tool picks marks and drags them, kept on the photo. Pointer positions
 * become fractions of the photo at once; shapes are drawn in photo pixels, scaled to fit.
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
  onPlaceText,
  onEditText,
  onTextChange,
  onTextCommit,
  onTextCancel,
}: Props) {
  const [draft, setDraft] = useState<Annotation | null>(null);
  const [hovering, setHovering] = useState(false);
  const [surface, setSurface] = useState<HTMLDivElement | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const transformer = useRef<KonvaTransformer>(null);
  const groups = useRef(new Map<number, KonvaGroup>());
  const selecting = tool === 'select' && !disabled;
  const scale = { x: shown.width / size.width, y: shown.height / size.height };
  const hiddenId = text?.id ?? null;

  // The selection box follows the selected mark, also after it moved or changed.
  useEffect(() => {
    const node = selectedId === hiddenId ? undefined : groups.current.get(selectedId ?? -1);
    transformer.current?.nodes(node ? [node] : []);
    transformer.current?.forceUpdate();
  }, [selectedId, hiddenId, items, shown]);

  function position(event: PointerEvent<HTMLElement>): Point {
    const box = event.currentTarget.getBoundingClientRect();
    return toFraction({ x: event.clientX - box.left, y: event.clientY - box.top }, shown);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    // Only presses on the photo itself; the label field handles its own.
    if (!(event.target instanceof HTMLCanvasElement)) return;
    // Focus here, so Delete and Ctrl+Z reach the editor and a label being typed is committed.
    event.currentTarget.focus({ preventScroll: true });
    if (disabled || tool === 'select' || gesture.current || event.button !== 0) return;
    const start = position(event);
    // Keep the pointer while it leaves the photo: the mark then ends at the edge.
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { pointerId: event.pointerId, tool, start, points: [start.x, start.y] };
    onSelect(null);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (current?.pointerId !== event.pointerId) return;
    const point = position(event);
    if (current.tool === 'freehand') {
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
  }

  /** Keeps a dragged mark on the photo (positions in screen pixels). */
  function boundMove(annotation: Annotation, target: Vector2d): Vector2d {
    const move = clampMove(
      annotationBounds(annotation),
      target.x / shown.width,
      target.y / shown.height,
    );
    return { x: move.x * shown.width, y: move.y * shown.height };
  }

  /** Back from typing a label: the keys go to the editor again. */
  function refocus() {
    surface?.focus({ preventScroll: true });
  }

  return (
    <div
      ref={setSurface}
      tabIndex={-1}
      role="img"
      aria-label={items.length === 1 ? 'Photo with 1 mark' : `Photo with ${items.length} marks`}
      data-annotation-canvas=""
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onPointerCancel}
      style={{ width: shown.width, height: shown.height }}
      className={clsx(
        // No scrolling or zooming the page while drawing with a finger or pen. White behind a
        // transparent PNG, as in the stored photo and the flattened copy.
        'relative touch-none bg-white shadow-lg outline-none select-none',
        selecting
          ? hovering && 'cursor-move'
          : !disabled && (tool === 'text' ? 'cursor-text' : 'cursor-crosshair'),
      )}
    >
      <Stage
        width={shown.width}
        height={shown.height}
        onPointerDown={(event) => {
          // A press on the photo itself, not on a mark, clears the selection.
          if (selecting && event.target === event.target.getStage()) onSelect(null);
        }}
      >
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
                listening={selecting}
                draggable={selecting}
                dragBoundFunc={(target) => boundMove(item.annotation, target)}
                onPointerDown={() => onSelect(item.id)}
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
                onPointerEnter={() => setHovering(true)}
                onPointerLeave={() => setHovering(false)}
              >
                <AnnotationShapes
                  specs={shapeSpecs(item.annotation, size)}
                  minHitWidth={HIT_PX / scale.x}
                />
              </Group>
            ),
          )}
          {draft && (
            <Group listening={false}>
              <AnnotationShapes specs={shapeSpecs(draft, size)} minHitWidth={0} />
            </Group>
          )}
          <Transformer
            ref={transformer}
            listening={false}
            resizeEnabled={false}
            rotateEnabled={false}
            borderStroke={SELECTION_COLOR}
            borderStrokeWidth={1.5}
            borderDash={[6, 4]}
            padding={6}
          />
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

/** An annotation's shapes (a light line's outline, then the mark), bottom first. */
function AnnotationShapes({ specs, minHitWidth }: { specs: ShapeSpec[]; minHitWidth: number }) {
  return specs.map((spec, index) => (
    <AnnotationShape key={index} spec={spec} minHitWidth={minHitWidth} />
  ));
}

function AnnotationShape({ spec, minHitWidth }: { spec: ShapeSpec; minHitWidth: number }) {
  if (spec.type === 'Text') return <Text {...spec.config} />;
  const hitStrokeWidth = Math.max(minHitWidth, spec.config.strokeWidth ?? 0);
  switch (spec.type) {
    case 'Arrow':
      return <Arrow {...spec.config} hitStrokeWidth={hitStrokeWidth} />;
    case 'Line':
      return <Line {...spec.config} hitStrokeWidth={hitStrokeWidth} />;
    case 'Rect':
      return <Rect {...spec.config} hitStrokeWidth={hitStrokeWidth} />;
    case 'Ellipse':
      return <Ellipse {...spec.config} hitStrokeWidth={hitStrokeWidth} />;
  }
}
