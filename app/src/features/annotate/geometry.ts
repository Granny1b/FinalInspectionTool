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
 * The box an annotation covers, in fractions. A turned box or ellipse covers more than its own
 * size: how much depends on the photo's shape (`aspect`, its width over its height), since the
 * turn is on screen, where both sides have the same pixels. A text label's box is its anchor
 * (top-left) only: its width depends on the font, which only the canvas knows.
 */
export function annotationBounds(annotation: Annotation, aspect = 1): Bounds {
  switch (annotation.kind) {
    case 'arrow':
    case 'freehand':
      return pointBounds(annotation.points);
    case 'rect':
    case 'ellipse': {
      const { x, y, w, h } = annotation;
      if (!annotation.rotation) return { x0: x, y0: y, x1: x + w, y1: y + h };
      const half = turnedHalfSize(annotation, aspect);
      const cx = x + w / 2;
      const cy = y + h / 2;
      return { x0: cx - half.x, y0: cy - half.y, x1: cx + half.x, y1: cy + half.y };
    }
    case 'text':
      return { x0: annotation.x, y0: annotation.y, x1: annotation.x, y1: annotation.y };
  }
}

/** Half the width and height (fractions) a turned box or ellipse covers on a photo of `aspect`. */
function turnedHalfSize(
  annotation: Extract<Annotation, { kind: 'rect' | 'ellipse' }>,
  aspect: number,
): Point {
  // On screen, with the photo `aspect` wide and 1 high.
  const halfW = (annotation.w * aspect) / 2;
  const halfH = annotation.h / 2;
  const turn = ((annotation.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(turn));
  const sin = Math.abs(Math.sin(turn));
  const [across, down] =
    annotation.kind === 'rect'
      ? [halfW * cos + halfH * sin, halfW * sin + halfH * cos]
      : [Math.hypot(halfW * cos, halfH * sin), Math.hypot(halfW * sin, halfH * cos)];
  return { x: across / aspect, y: down };
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

/** The annotation moved by (dx, dy) fractions, kept on the photo (of `aspect`, as above). */
export function moveAnnotation(
  annotation: Annotation,
  dx: number,
  dy: number,
  aspect = 1,
): Annotation {
  const move = clampMove(annotationBounds(annotation, aspect), dx, dy);
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

/**
 * A turn in degrees as stored: -180 to 180, to a tenth of a degree, and 0 for (almost) none.
 */
export function normalRotation(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0;
  const turned = Math.round(((((degrees % 360) + 540) % 360) - 180) * 10) / 10;
  // -180 and 180 are the same turn; 180 is kept.
  const value = turned === -180 ? 180 : turned;
  return Math.abs(value) < 0.05 ? 0 : value;
}

/** The mark with its turn set, the key left out when it isn't turned. */
function withRotation<A extends Extract<Annotation, { kind: 'rect' | 'ellipse' | 'text' }>>(
  annotation: A,
  degrees: number,
): A {
  const { rotation: _old, ...rest } = annotation;
  const rotation = normalRotation(degrees);
  return (rotation ? { ...rest, rotation } : rest) as A;
}

/**
 * Where the selection's handles left a mark's Konva shape, in photo pixels: the point it turns
 * about (a box's or ellipse's centre, a label's top-left corner, a line's origin), its scale and
 * its turn in degrees.
 */
export type ShapeFrame = { x: number; y: number; scaleX: number; scaleY: number; rotation: number };

/**
 * The annotation as the handles left it (`frame`) on a photo of `size` pixels: resized, turned or
 * both. A box or ellipse keeps its centre and turn and grows by the scale; a label grows with its
 * height; a freehand line's points are turned and scaled into place, so it stores no turn. Rounded
 * as drawn marks are; an unturned box is kept on the photo.
 */
export function transformAnnotation(
  annotation: Annotation,
  frame: ShapeFrame,
  size: Size,
): Annotation {
  const scaleX = Number.isFinite(frame.scaleX) ? Math.abs(frame.scaleX) : 1;
  const scaleY = Number.isFinite(frame.scaleY) ? Math.abs(frame.scaleY) : 1;
  const atX = frame.x / size.width;
  const atY = frame.y / size.height;
  switch (annotation.kind) {
    case 'arrow':
    case 'freehand': {
      const turn = (normalRotation(frame.rotation) * Math.PI) / 180;
      const cos = Math.cos(turn);
      const sin = Math.sin(turn);
      const points: number[] = [];
      for (let index = 0; index + 1 < annotation.points.length; index += 2) {
        // In photo pixels: scaled, turned about the origin, then moved.
        const px = annotation.points[index]! * size.width * scaleX;
        const py = annotation.points[index + 1]! * size.height * scaleY;
        points.push(
          roundFraction(clamp((frame.x + px * cos - py * sin) / size.width, 0, 1)),
          roundFraction(clamp((frame.y + px * sin + py * cos) / size.height, 0, 1)),
        );
      }
      return { ...annotation, points };
    }
    case 'rect':
    case 'ellipse': {
      const w = roundFraction(annotation.w * scaleX);
      const h = roundFraction(annotation.h * scaleY);
      const turned = withRotation({ ...annotation, w, h }, frame.rotation);
      if (turned.rotation) {
        return { ...turned, x: roundFraction(atX - w / 2), y: roundFraction(atY - h / 2) };
      }
      const x0 = roundFraction(clamp(atX - w / 2, 0, 1));
      const y0 = roundFraction(clamp(atY - h / 2, 0, 1));
      return {
        ...turned,
        x: x0,
        y: y0,
        w: roundFraction(clamp(atX + w / 2, 0, 1) - x0),
        h: roundFraction(clamp(atY + h / 2, 0, 1) - y0),
      };
    }
    case 'text':
      return withRotation(
        {
          ...annotation,
          x: roundFraction(clamp(atX, 0, 1)),
          y: roundFraction(clamp(atY, 0, 1)),
          // Never 0, which the schema refuses: the handles keep a label far bigger than this.
          size: Math.max(0.0001, roundFraction(annotation.size * scaleY)),
        },
        frame.rotation,
      );
  }
}

/**
 * A box on screen in pixels, as the selection's handles report it while they are dragged: its
 * top-left corner, size and turn (radians, about that corner), as Konva gives it.
 */
export type Box = { x: number; y: number; width: number; height: number; rotation?: number };

/** Boxes, labels and freehand lines can't be made smaller than this by their handles (pixels). */
export const MIN_BOX_PX = 12;

/**
 * The box a handle drag may take (`next`, from `old`): on the photo (`area`), and no smaller than
 * MIN_BOX_PX. A side a handle moved stops at the photo's edge; one already past it (an old or
 * hand-made mark) may stay there. Shrinking below the minimum keeps that direction's old size.
 * With `keepRatio` (labels, freehand), a box that would leave the photo or get too small keeps
 * the old one whole, since stopping one side would stretch the other. So does a turned box (or
 * one being turned), whose sides don't run along the photo's: a corner may not go further off
 * the photo than one already was.
 */
export function limitBox<B extends Box>(old: B, next: B, area: Size, keepRatio: boolean): B {
  if (turned(old) || turned(next)) {
    const tooSmall = (now: number, before: number) =>
      Math.abs(now) < MIN_BOX_PX && Math.abs(now) < Math.abs(before);
    if (tooSmall(next.width, old.width) || tooSmall(next.height, old.height)) return old;
    return overflow(next, area) > Math.max(overflow(old, area), EDGE_PX) ? old : next;
  }
  const x = limitAxis(old.x, old.width, next.x, next.width, area.width);
  const y = limitAxis(old.y, old.height, next.y, next.height, area.height);
  if (keepRatio) {
    if (!x || !y) return old;
    const held = (start: number, size: number, limited: readonly [number, number]) =>
      Math.abs(limited[0] - start) > EDGE_PX || Math.abs(limited[1] - size) > EDGE_PX;
    return held(next.x, next.width, x) || held(next.y, next.height, y) ? old : next;
  }
  return {
    ...next,
    ...(x ? { x: x[0], width: x[1] } : { x: old.x, width: old.width }),
    ...(y ? { y: y[0], height: y[1] } : { y: old.y, height: old.height }),
  };
}

function turned(box: Box): boolean {
  return Math.abs(box.rotation ?? 0) > 1e-6;
}

/** How far (pixels) the box's furthest corner lies off the photo; 0 when it is all on it. */
function overflow(box: Box, area: Size): number {
  const cos = Math.cos(box.rotation ?? 0);
  const sin = Math.sin(box.rotation ?? 0);
  let most = 0;
  for (const [u, v] of [
    [0, 0],
    [box.width, 0],
    [box.width, box.height],
    [0, box.height],
  ] as const) {
    const x = box.x + u * cos - v * sin;
    const y = box.y + u * sin + v * cos;
    most = Math.max(most, -x, x - area.width, -y, y - area.height);
  }
  return most;
}

/** Less than this (pixels) is the same edge: the handles' arithmetic leaves crumbs. */
const EDGE_PX = 0.01;

/** One direction of limitBox: the start and size it may take, or null to keep the old one. */
function limitAxis(
  oldStart: number,
  oldSize: number,
  start: number,
  size: number,
  length: number,
): readonly [number, number] | null {
  let from = start;
  let to = start + size;
  if (Math.abs(from - oldStart) > EDGE_PX) from = Math.max(from, Math.min(0, oldStart));
  if (Math.abs(to - (oldStart + oldSize)) > EDGE_PX) {
    to = Math.min(to, Math.max(length, oldStart + oldSize));
  }
  const limited = to - from;
  if (limited < MIN_BOX_PX && limited < oldSize) return null;
  return [from, limited];
}

export type ArrowEnd = 'tail' | 'tip';

/**
 * The arrow with one end dragged to `at` (fractions, already on the photo), or null when that
 * would leave it shorter than MIN_ARROW_PX on screen.
 */
export function moveArrowEnd(
  annotation: Extract<Annotation, { kind: 'arrow' }>,
  end: ArrowEnd,
  at: Point,
  shown: Size,
): Extract<Annotation, { kind: 'arrow' }> | null {
  const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = annotation.points;
  const points = end === 'tail' ? [at.x, at.y, x2, y2] : [x1, y1, at.x, at.y];
  const length = screenDistance(
    { x: points[0]!, y: points[1]! },
    { x: points[2]!, y: points[3]! },
    shown,
  );
  if (length < MIN_ARROW_PX) return null;
  return { ...annotation, points: points.map(roundFraction) };
}

/** How far a copy is set off from its original, as a fraction of each side of the photo. */
export const DUPLICATE_OFFSET = 0.03;

/**
 * Where a copy of a mark goes: down and right of it, or up or left where the photo ends, so it is
 * seen as a copy rather than lying exactly on the original.
 */
export function duplicateOffset(bounds: Bounds): Point {
  const along = (from: number, to: number) =>
    to + DUPLICATE_OFFSET <= 1 || from - DUPLICATE_OFFSET < 0
      ? DUPLICATE_OFFSET
      : -DUPLICATE_OFFSET;
  return { x: along(bounds.x0, bounds.x1), y: along(bounds.y0, bounds.y1) };
}
