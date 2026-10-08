import type { Annotation } from '@modig/shared';
import { describe, expect, it } from 'vitest';
import {
  annotationBounds,
  clampMove,
  extendStroke,
  fitInto,
  MIN_ARROW_PX,
  MIN_DRAG_PX,
  moveAnnotation,
  roundFraction,
  screenDistance,
  shapeFromDrag,
  strokeFromPoints,
  toFraction,
} from './geometry';

/** The photo as shown on screen in these tests: 1000 × 500 px. */
const SHOWN = { width: 1000, height: 500 };
const RED = '#E02424';

describe('roundFraction', () => {
  it('keeps four decimals', () => {
    expect(roundFraction(0.123456)).toBe(0.1235);
    expect(roundFraction(0.3 - 0.1)).toBe(0.2);
    expect(roundFraction(1)).toBe(1);
  });
});

describe('toFraction', () => {
  it('turns screen pixels into fractions of the shown photo', () => {
    expect(toFraction({ x: 250, y: 125 }, SHOWN)).toEqual({ x: 0.25, y: 0.25 });
    expect(toFraction({ x: 0, y: 500 }, SHOWN)).toEqual({ x: 0, y: 1 });
  });

  it('keeps a position outside the photo on its edge', () => {
    expect(toFraction({ x: -40, y: 900 }, SHOWN)).toEqual({ x: 0, y: 1 });
    expect(toFraction({ x: 1200, y: -1 }, SHOWN)).toEqual({ x: 1, y: 0 });
  });

  it('rounds to four decimals', () => {
    expect(toFraction({ x: 333.33333, y: 1 }, SHOWN)).toEqual({ x: 0.3333, y: 0.002 });
  });
});

describe('fitInto', () => {
  it('fits a landscape photo by its width, keeping the aspect ratio', () => {
    expect(fitInto({ width: 1600, height: 1200 }, { width: 800, height: 800 })).toEqual({
      width: 800,
      height: 600,
    });
  });

  it('fits a portrait photo by its height', () => {
    expect(fitInto({ width: 1200, height: 1600 }, { width: 1000, height: 800 })).toEqual({
      width: 600,
      height: 800,
    });
  });

  it('enlarges a small photo to fill the room', () => {
    expect(fitInto({ width: 400, height: 300 }, { width: 1200, height: 1200 })).toEqual({
      width: 1200,
      height: 900,
    });
  });

  it('uses whole pixels that never exceed the room', () => {
    const fitted = fitInto({ width: 1600, height: 1067 }, { width: 777.5, height: 999 });
    expect(fitted).toEqual({ width: 777, height: 518 });
  });

  it('gives nothing while there is no room yet', () => {
    expect(fitInto({ width: 1600, height: 1200 }, { width: 0, height: 0 })).toBeNull();
    expect(fitInto({ width: 1600, height: 1200 }, { width: 500, height: 0.5 })).toBeNull();
  });
});

describe('screenDistance', () => {
  it('measures in screen pixels, not fractions', () => {
    expect(screenDistance({ x: 0, y: 0 }, { x: 0.3, y: 0 }, SHOWN)).toBeCloseTo(300);
    expect(screenDistance({ x: 0, y: 0 }, { x: 0, y: 0.3 }, SHOWN)).toBeCloseTo(150);
    expect(screenDistance({ x: 0, y: 0 }, { x: 0.003, y: 0.008 }, SHOWN)).toBeCloseTo(5);
  });
});

describe('shapeFromDrag', () => {
  it('draws an arrow from the tail (press) to the tip (release)', () => {
    expect(shapeFromDrag('arrow', { x: 0.1, y: 0.2 }, { x: 0.5, y: 0.6 }, RED, SHOWN)).toEqual({
      kind: 'arrow',
      points: [0.1, 0.2, 0.5, 0.6],
      color: RED,
    });
  });

  it('keeps an arrow drawn right to left and upwards pointing where it was drawn', () => {
    expect(shapeFromDrag('arrow', { x: 0.8, y: 0.9 }, { x: 0.2, y: 0.1 }, RED, SHOWN)).toEqual({
      kind: 'arrow',
      points: [0.8, 0.9, 0.2, 0.1],
      color: RED,
    });
  });

  it('ignores an arrow shorter than its own head', () => {
    const tooShort = (MIN_ARROW_PX - 1) / SHOWN.width;
    expect(
      shapeFromDrag('arrow', { x: 0.5, y: 0.5 }, { x: 0.5 + tooShort, y: 0.5 }, RED, SHOWN),
    ).toBeNull();
    const longEnough = (MIN_ARROW_PX + 1) / SHOWN.width;
    expect(
      shapeFromDrag('arrow', { x: 0.5, y: 0.5 }, { x: 0.5 + longEnough, y: 0.5 }, RED, SHOWN),
    ).not.toBeNull();
  });

  it('draws a box from corner to corner', () => {
    expect(shapeFromDrag('rect', { x: 0.1, y: 0.2 }, { x: 0.4, y: 0.7 }, RED, SHOWN)).toEqual({
      kind: 'rect',
      x: 0.1,
      y: 0.2,
      w: 0.3,
      h: 0.5,
      color: RED,
    });
  });

  it('normalises a box dragged up and to the left to a positive size', () => {
    expect(shapeFromDrag('rect', { x: 0.4, y: 0.7 }, { x: 0.1, y: 0.2 }, RED, SHOWN)).toEqual({
      kind: 'rect',
      x: 0.1,
      y: 0.2,
      w: 0.3,
      h: 0.5,
      color: RED,
    });
  });

  it('normalises a box dragged up and to the right', () => {
    expect(shapeFromDrag('ellipse', { x: 0.2, y: 0.8 }, { x: 0.6, y: 0.3 }, RED, SHOWN)).toEqual({
      kind: 'ellipse',
      x: 0.2,
      y: 0.3,
      w: 0.4,
      h: 0.5,
      color: RED,
    });
  });

  it('ignores a click (a press that hardly moved) for boxes', () => {
    const jitter = { x: 0.5 + 3 / SHOWN.width, y: 0.5 + 2 / SHOWN.height };
    expect(shapeFromDrag('rect', { x: 0.5, y: 0.5 }, jitter, RED, SHOWN)).toBeNull();
    expect(shapeFromDrag('ellipse', { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, RED, SHOWN)).toBeNull();
  });

  it('measures the click threshold on screen, in the larger direction', () => {
    const wide = { x: 0.5 + MIN_DRAG_PX / SHOWN.width, y: 0.5 };
    expect(shapeFromDrag('rect', { x: 0.5, y: 0.5 }, wide, RED, SHOWN)).not.toBeNull();
    // The same fraction vertically is only half as many pixels (the photo is 500 px high).
    const tall = { x: 0.5, y: 0.5 + MIN_DRAG_PX / SHOWN.width };
    expect(shapeFromDrag('rect', { x: 0.5, y: 0.5 }, tall, RED, SHOWN)).toBeNull();
  });

  it('rounds the size to four decimals', () => {
    const box = shapeFromDrag('rect', { x: 0.1, y: 0.1 }, { x: 0.3, y: 0.4 }, RED, SHOWN);
    expect(box).toMatchObject({ w: 0.2, h: 0.3 });
  });
});

describe('extendStroke and strokeFromPoints', () => {
  it('adds points that moved far enough', () => {
    expect(extendStroke([0.1, 0.1], { x: 0.2, y: 0.1 }, SHOWN)).toEqual([0.1, 0.1, 0.2, 0.1]);
  });

  it('skips points closer than the step to the last one', () => {
    expect(extendStroke([0.1, 0.1], { x: 0.1005, y: 0.1 }, SHOWN)).toEqual([0.1, 0.1]);
  });

  it('starts an empty stroke with the first point', () => {
    expect(extendStroke([], { x: 0.4, y: 0.5 }, SHOWN)).toEqual([0.4, 0.5]);
  });

  it('never changes the stroke it was given', () => {
    const points = [0.1, 0.1];
    extendStroke(points, { x: 0.9, y: 0.9 }, SHOWN);
    expect(points).toEqual([0.1, 0.1]);
  });

  it('turns a stroke into a freehand annotation', () => {
    expect(strokeFromPoints([0.1, 0.1, 0.2, 0.15, 0.3, 0.1], RED, SHOWN)).toEqual({
      kind: 'freehand',
      points: [0.1, 0.1, 0.2, 0.15, 0.3, 0.1],
      color: RED,
    });
  });

  it('ignores a stroke no bigger than a click', () => {
    expect(strokeFromPoints([0.5, 0.5], RED, SHOWN)).toBeNull();
    expect(strokeFromPoints([0.5, 0.5, 0.503, 0.505], RED, SHOWN)).toBeNull();
  });
});

describe('annotationBounds', () => {
  it('spans the points of arrows and strokes', () => {
    expect(
      annotationBounds({ kind: 'freehand', points: [0.5, 0.1, 0.2, 0.6, 0.3, 0.4], color: RED }),
    ).toEqual({ x0: 0.2, y0: 0.1, x1: 0.5, y1: 0.6 });
    expect(annotationBounds({ kind: 'arrow', points: [0.9, 0.8, 0.1, 0.2], color: RED })).toEqual({
      x0: 0.1,
      y0: 0.2,
      x1: 0.9,
      y1: 0.8,
    });
  });

  it('is the box of rectangles and ellipses', () => {
    expect(
      annotationBounds({ kind: 'ellipse', x: 0.1, y: 0.2, w: 0.3, h: 0.4, color: RED }),
    ).toEqual({ x0: 0.1, y0: 0.2, x1: 0.4, y1: 0.6000000000000001 });
  });

  it('is the anchor of a text label', () => {
    expect(
      annotationBounds({ kind: 'text', x: 0.3, y: 0.4, text: 'Loose', color: RED, size: 0.05 }),
    ).toEqual({ x0: 0.3, y0: 0.4, x1: 0.3, y1: 0.4 });
  });
});

describe('clampMove', () => {
  const box = { x0: 0.2, y0: 0.3, x1: 0.6, y1: 0.7 };

  it('lets a move inside the photo through', () => {
    expect(clampMove(box, 0.1, -0.2)).toEqual({ x: 0.1, y: -0.2 });
  });

  it('stops at every edge', () => {
    expect(clampMove(box, 0.9, 0.9)).toEqual({ x: 0.4, y: 0.30000000000000004 });
    expect(clampMove(box, -0.9, -0.9)).toEqual({ x: -0.2, y: -0.3 });
  });

  it('never pushes a box that is already off the photo further out', () => {
    const off = { x0: -0.1, y0: 0.2, x1: 0.3, y1: 0.5 };
    expect(clampMove(off, -0.2, 0)).toEqual({ x: 0, y: 0 });
    expect(clampMove(off, 0.2, 0)).toEqual({ x: 0.2, y: 0 });
  });
});

describe('moveAnnotation', () => {
  it('moves every point of an arrow or a stroke', () => {
    const arrow: Annotation = { kind: 'arrow', points: [0.1, 0.2, 0.3, 0.4], color: RED };
    expect(moveAnnotation(arrow, 0.1, 0.05)).toEqual({
      kind: 'arrow',
      points: [0.2, 0.25, 0.4, 0.45],
      color: RED,
    });
  });

  it('moves the corner of a box and the anchor of a label', () => {
    const rect: Annotation = { kind: 'rect', x: 0.1, y: 0.1, w: 0.2, h: 0.2, color: RED };
    expect(moveAnnotation(rect, 0.3, 0.2)).toEqual({ ...rect, x: 0.4, y: 0.3 });
    const label: Annotation = {
      kind: 'text',
      x: 0.5,
      y: 0.5,
      text: 'Burr',
      color: RED,
      size: 0.05,
    };
    expect(moveAnnotation(label, -0.25, 0.1)).toEqual({ ...label, x: 0.25, y: 0.6 });
  });

  it('keeps the mark on the photo', () => {
    const rect: Annotation = { kind: 'rect', x: 0.6, y: 0.1, w: 0.3, h: 0.2, color: RED };
    expect(moveAnnotation(rect, 0.5, -0.5)).toEqual({ ...rect, x: 0.7, y: 0 });
    const stroke: Annotation = { kind: 'freehand', points: [0.1, 0.5, 0.2, 0.9], color: RED };
    expect(moveAnnotation(stroke, -0.5, 0.5)).toEqual({ ...stroke, points: [0, 0.6, 0.1, 1] });
  });

  it('leaves the original untouched', () => {
    const arrow: Annotation = { kind: 'arrow', points: [0.1, 0.2, 0.3, 0.4], color: RED };
    moveAnnotation(arrow, 0.1, 0.1);
    expect(arrow.points).toEqual([0.1, 0.2, 0.3, 0.4]);
  });
});
