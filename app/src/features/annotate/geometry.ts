/**
 * Annotation geometry. Annotations are stored as fractions (0–1) of the photo's width and height
 * (brief §4), so they survive resizing and print at any size; these helpers turn pointer positions
 * into such fractions, build annotations from pointer drags and move them.
 */
import type { Annotation } from '@modig/shared';

export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
/** A box in fractions: left, top, right, bottom. */
export type Bounds = { x0: number; y0: number; x1: number; y1: number };

/** Shapes drawn by dragging from one corner (or the tail) to the other. */
export type DragKind = 'arrow' | 'rect' | 'ellipse';

/** A press that moves less than this (screen pixels) is a click, not a drawing. */
export const MIN_DRAG_PX = 6;
/** Shorter arrows would be all head. */
export const MIN_ARROW_PX = 12;
/** A freehand stroke keeps a point only this far (screen pixels) from the last one. */
export const STROKE_STEP_PX = 2;

/** Four decimals: 0.16 px on a 1600 px photo, and short JSON. */
export function roundFraction(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * A position on the photo as shown (screen pixels from its top-left corner) as fractions of the
 * photo, kept on the photo: a drag that leaves it ends at the edge.
 */
export function toFraction(point: Point, shown: Size): Point {
  return {
    x: roundFraction(clamp(point.x / shown.width, 0, 1)),
    y: roundFraction(clamp(point.y / shown.height, 0, 1)),
  };
}

/**
 * The largest size with the photo's aspect ratio that fits in `box` (enlarging a small photo too,
 * so it fills the editor), in whole pixels; null while the box has no room.
 */
export function fitInto(photo: Size, box: Size): Size | null {
  if (box.width < 1 || box.height < 1) return null;
  const scale = Math.min(box.width / photo.width, box.height / photo.height);
  return {
    width: Math.max(1, Math.floor(photo.width * scale)),
    height: Math.max(1, Math.floor(photo.height * scale)),
  };
}

/** Distance between two positions (fractions) in screen pixels of the photo as shown. */
export function screenDistance(a: Point, b: Point, shown: Size): number {
  return Math.hypot((b.x - a.x) * shown.width, (b.y - a.y) * shown.height);
}

/**
 * The annotation a drag from `start` to `end` (fractions) draws, or null for a click. Boxes may be
 * dragged in any direction: they are stored with a positive width and height.
 */
export function shapeFromDrag(
  kind: DragKind,
  start: Point,
  end: Point,
  color: string,
  shown: Size,
): Annotation | null {
  if (kind === 'arrow') {
    if (screenDistance(start, end, shown) < MIN_ARROW_PX) return null;
    return { kind, points: [start.x, start.y, end.x, end.y], color };
  }
  const w = Math.abs(end.x - start.x);
  const h = Math.abs(end.y - start.y);
  if (Math.max(w * shown.width, h * shown.height) < MIN_DRAG_PX) return null;
  return {
    kind,
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    w: roundFraction(w),
    h: roundFraction(h),
    color,
  };
}

/** Adds a pointer position to a freehand stroke, unless it is too close to the last point. */
export function extendStroke(points: readonly number[], point: Point, shown: Size): number[] {
  const lastX = points.at(-2);
  const lastY = points.at(-1);
  if (
    lastX !== undefined &&
    lastY !== undefined &&
    screenDistance({ x: lastX, y: lastY }, point, shown) < STROKE_STEP_PX
  ) {
    return [...points];
  }
  return [...points, point.x, point.y];
}

/** The finished freehand stroke, or null when it is no bigger than a click. */
export function strokeFromPoints(
  points: readonly number[],
  color: string,
  shown: Size,
): Annotation | null {
  const { x0, y0, x1, y1 } = pointBounds(points);
  if (Math.max((x1 - x0) * shown.width, (y1 - y0) * shown.height) < MIN_DRAG_PX) return null;
  return { kind: 'freehand', points: [...points], color };
}

function pointBounds(points: readonly number[]): Bounds {
  const xs = points.filter((_, index) => index % 2 === 0);
  const ys = points.filter((_, index) => index % 2 === 1);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/**
 * The box an annotation covers, in fractions. A text label's box is its anchor (top-left) only:
 * its width depends on the font, which only the canvas knows.
 */
export function annotationBounds(annotation: Annotation): Bounds {
  switch (annotation.kind) {
    case 'arrow':
    case 'freehand':
      return pointBounds(annotation.points);
    case 'rect':
    case 'ellipse':
      return {
        x0: annotation.x,
        y0: annotation.y,
        x1: annotation.x + annotation.w,
        y1: annotation.y + annotation.h,
      };
    case 'text':
      return { x0: annotation.x, y0: annotation.y, x1: annotation.x, y1: annotation.y };
  }
}

/**
 * Limits a move (fractions) so the box stays on the photo; a box already partly off it (an old or
 * hand-made annotation) may still move back, never further out.
 */
export function clampMove(bounds: Bounds, dx: number, dy: number): Point {
  return {
    x: clamp(dx, Math.min(0, -bounds.x0), Math.max(0, 1 - bounds.x1)),
    y: clamp(dy, Math.min(0, -bounds.y0), Math.max(0, 1 - bounds.y1)),
  };
}

/** The annotation moved by (dx, dy) fractions, kept on the photo. */
export function moveAnnotation(annotation: Annotation, dx: number, dy: number): Annotation {
  const move = clampMove(annotationBounds(annotation), dx, dy);
  const shiftX = (value: number) => roundFraction(value + move.x);
  const shiftY = (value: number) => roundFraction(value + move.y);
  switch (annotation.kind) {
    case 'arrow':
    case 'freehand':
      return {
        ...annotation,
        points: annotation.points.map((value, index) =>
          index % 2 === 0 ? shiftX(value) : shiftY(value),
        ),
      };
    case 'rect':
    case 'ellipse':
    case 'text':
      return { ...annotation, x: shiftX(annotation.x), y: shiftY(annotation.y) };
  }
}
