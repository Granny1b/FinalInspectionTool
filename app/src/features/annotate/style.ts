/**
 * How annotations look, as plain Konva configs in photo pixels. The editor and the flattened copy
 * for print are drawn from the same configs, and every width and size is a share of the photo's
 * size, so a mark looks the same on screen, in a thumbnail and on paper whatever the resolution.
 */
import { ANNOTATION_COLORS, type Annotation } from '@modig/shared';
import type { ArrowConfig } from 'konva/lib/shapes/Arrow';
import type { EllipseConfig } from 'konva/lib/shapes/Ellipse';
import type { LineConfig } from 'konva/lib/shapes/Line';
import type { RectConfig } from 'konva/lib/shapes/Rect';
import type { TextConfig } from 'konva/lib/shapes/Text';
import { roundFraction, type Size } from './geometry';

/** Line width as a share of the long edge: 10 px on a 1600 px photo, 0.5 mm printed 8 cm wide. */
const LINE_SHARE = 0.0065;
/** A new text label's height as a share of the long edge: 64 px on a 1600 px photo. */
const TEXT_SHARE = 0.04;
/** Arrow heads grow with the line, so a thick arrow keeps its proportions. */
const HEAD_LENGTH = 4.5;
const HEAD_WIDTH = 4;

/** The app's font (bundled, so it is there offline and in the flattened copy). */
export const LABEL_FONT_FAMILY = 'Inter Variable, ui-sans-serif, system-ui, sans-serif';
export const LABEL_FONT_STYLE = 'bold';
/**
 * A dark halo keeps every colour readable on a busy photo and in black-and-white print: a soft
 * shadow behind lines, an outline around text.
 */
const SHADOW = { shadowColor: '#000000', shadowOpacity: 0.4 } as const;
const TEXT_OUTLINE = 'rgba(0, 0, 0, 0.7)';
const TEXT_OUTLINE_SHARE = 0.12;
/**
 * Yellow and white lines also get a thin dark outline: a black-and-white printer turns them into
 * greys of 77 % and 100 % luma, next to the 80–90 % of a light machine surface, where the soft
 * shadow alone fades. Red (36 %) and cyan (54 %) print clearly darker and keep the shadow only.
 */
const OUTLINED_COLORS: ReadonlySet<string> = new Set([
  ANNOTATION_COLORS.yellow,
  ANNOTATION_COLORS.white,
]);
const LINE_OUTLINE = 'rgba(0, 0, 0, 0.8)';
/** The outline on each side of a line, as a share of the line's width. */
const LINE_OUTLINE_SHARE = 0.35;

export function lineWidth(size: Size): number {
  return Math.max(size.width, size.height) * LINE_SHARE;
}

/** A new label's text size: a fraction of the photo's height, as text annotations store it. */
export function defaultTextSize(size: Size): number {
  return roundFraction((Math.max(size.width, size.height) * TEXT_SHARE) / size.height);
}

export type ShapeSpec =
  | { type: 'Arrow'; config: ArrowConfig }
  | { type: 'Line'; config: LineConfig }
  | { type: 'Rect'; config: RectConfig }
  | { type: 'Ellipse'; config: EllipseConfig }
  | { type: 'Text'; config: TextConfig };

/**
 * The Konva shapes that draw an annotation on a photo of `size` pixels, bottom first: a yellow or
 * white line's dark outline, then the mark itself. The editor and the flattened copy both use it.
 */
export function shapeSpecs(annotation: Annotation, size: Size): ShapeSpec[] {
  const mark = shapeSpec(annotation, size);
  const outline = OUTLINED_COLORS.has(annotation.color.toUpperCase()) ? lineOutline(mark) : null;
  return outline ? [outline, mark] : [mark];
}

/**
 * A wider, dark copy of a line to draw under it, so a thin dark edge shows on both sides. It takes
 * no pointer events (the mark itself is what gets picked) and has no shadow of its own.
 */
function lineOutline(spec: ShapeSpec): ShapeSpec | null {
  if (spec.type === 'Text') return null;
  const outline = {
    stroke: LINE_OUTLINE,
    strokeWidth: (spec.config.strokeWidth ?? 0) * (1 + 2 * LINE_OUTLINE_SHARE),
    shadowEnabled: false,
    listening: false,
  };
  switch (spec.type) {
    case 'Arrow':
      // The head is filled as well: its outline then runs round it like the shaft's.
      return { type: 'Arrow', config: { ...spec.config, ...outline, fill: LINE_OUTLINE } };
    case 'Line':
      return { type: 'Line', config: { ...spec.config, ...outline } };
    case 'Rect':
      return { type: 'Rect', config: { ...spec.config, ...outline } };
    case 'Ellipse':
      return { type: 'Ellipse', config: { ...spec.config, ...outline } };
  }
}

/** The Konva shape for an annotation on a photo of `size` pixels (the mark, without outline). */
export function shapeSpec(annotation: Annotation, size: Size): ShapeSpec {
  const width = lineWidth(size);
  const line = {
    stroke: annotation.color,
    strokeWidth: width,
    lineCap: 'round',
    lineJoin: 'round',
    ...SHADOW,
    shadowBlur: width,
  } as const;
  const toPixels = (points: readonly number[]) =>
    points.map((value, index) => value * (index % 2 === 0 ? size.width : size.height));

  switch (annotation.kind) {
    case 'arrow':
      return {
        type: 'Arrow',
        config: {
          ...line,
          points: toPixels(annotation.points),
          fill: annotation.color,
          pointerLength: width * HEAD_LENGTH,
          pointerWidth: width * HEAD_WIDTH,
        },
      };
    case 'freehand':
      return { type: 'Line', config: { ...line, points: toPixels(annotation.points) } };
    case 'rect':
      return {
        type: 'Rect',
        config: {
          ...line,
          x: annotation.x * size.width,
          y: annotation.y * size.height,
          width: annotation.w * size.width,
          height: annotation.h * size.height,
        },
      };
    case 'ellipse':
      return {
        type: 'Ellipse',
        config: {
          ...line,
          x: (annotation.x + annotation.w / 2) * size.width,
          y: (annotation.y + annotation.h / 2) * size.height,
          radiusX: (annotation.w * size.width) / 2,
          radiusY: (annotation.h * size.height) / 2,
        },
      };
    case 'text': {
      const fontSize = annotation.size * size.height;
      return {
        type: 'Text',
        config: {
          x: annotation.x * size.width,
          y: annotation.y * size.height,
          text: annotation.text,
          fontSize,
          fontFamily: LABEL_FONT_FAMILY,
          fontStyle: LABEL_FONT_STYLE,
          lineHeight: 1.1,
          fill: annotation.color,
          stroke: TEXT_OUTLINE,
          strokeWidth: fontSize * TEXT_OUTLINE_SHARE,
          fillAfterStrokeEnabled: true,
          lineJoin: 'round',
        },
      };
    }
  }
}
