import { ANNOTATION_COLORS, type Annotation } from '@modig/shared';
import { describe, expect, it } from 'vitest';
import { defaultTextSize, lineWidth, shapeSpec, shapeSpecs } from './style';

const RED = ANNOTATION_COLORS.red;
const PHOTO = { width: 1600, height: 1200 };

describe('lineWidth', () => {
  it('is a share of the long edge, so it scales with the photo', () => {
    expect(lineWidth(PHOTO)).toBeCloseTo(10.4);
    expect(lineWidth({ width: 800, height: 600 })).toBeCloseTo(5.2);
    expect(lineWidth({ width: 1200, height: 1600 })).toBeCloseTo(10.4);
  });
});

describe('defaultTextSize', () => {
  it('is a fraction of the height giving the same pixel size in either orientation', () => {
    const landscape = defaultTextSize(PHOTO);
    const portrait = defaultTextSize({ width: 1200, height: 1600 });
    expect(landscape * 1200).toBeCloseTo(64, 0);
    expect(portrait * 1600).toBeCloseTo(64, 0);
  });

  it('does not depend on the resolution', () => {
    expect(defaultTextSize({ width: 800, height: 600 })).toBe(defaultTextSize(PHOTO));
  });
});

describe('shapeSpec', () => {
  it('draws an arrow in photo pixels, with a head proportional to the line', () => {
    const spec = shapeSpec({ kind: 'arrow', points: [0.1, 0.5, 0.6, 0.25], color: RED }, PHOTO);
    expect(spec.type).toBe('Arrow');
    if (spec.type !== 'Arrow') return;
    expect(spec.config.points).toEqual([160, 600, 960, 300]);
    expect(spec.config.stroke).toBe(RED);
    expect(spec.config.fill).toBe(RED);
    expect(spec.config.strokeWidth).toBeCloseTo(10.4);
    expect(spec.config.pointerLength).toBeCloseTo(10.4 * 4.5);
    expect(spec.config.pointerWidth).toBeCloseTo(10.4 * 4);
  });

  it('draws a freehand stroke as a round-capped line', () => {
    const spec = shapeSpec({ kind: 'freehand', points: [0, 0, 0.5, 1], color: RED }, PHOTO);
    expect(spec).toMatchObject({
      type: 'Line',
      config: { points: [0, 0, 800, 1200], lineCap: 'round', lineJoin: 'round', stroke: RED },
    });
  });

  it('draws a rectangle from its corner and size', () => {
    const spec = shapeSpec(
      { kind: 'rect', x: 0.25, y: 0.5, w: 0.5, h: 0.25, color: ANNOTATION_COLORS.cyan },
      PHOTO,
    );
    expect(spec).toMatchObject({
      type: 'Rect',
      config: { x: 400, y: 600, width: 800, height: 300, stroke: ANNOTATION_COLORS.cyan },
    });
    expect(spec.config.fill).toBeUndefined();
  });

  it('draws an ellipse inside its box (Konva places it by its centre)', () => {
    const spec = shapeSpec(
      { kind: 'ellipse', x: 0.25, y: 0.5, w: 0.5, h: 0.25, color: ANNOTATION_COLORS.yellow },
      PHOTO,
    );
    expect(spec).toMatchObject({
      type: 'Ellipse',
      config: { x: 800, y: 750, radiusX: 400, radiusY: 150 },
    });
  });

  it('draws a label at its top-left corner, sized by the photo height, outlined', () => {
    const spec = shapeSpec(
      { kind: 'text', x: 0.5, y: 0.25, text: 'Loose cable', color: RED, size: 0.05 },
      PHOTO,
    );
    expect(spec).toMatchObject({
      type: 'Text',
      config: { x: 800, y: 300, text: 'Loose cable', fontSize: 60, fill: RED, fontStyle: 'bold' },
    });
    if (spec.type !== 'Text') return;
    expect(spec.config.fontFamily).toMatch(/^Inter Variable,/);
    expect(spec.config.strokeWidth).toBeCloseTo(7.2);
    expect(spec.config.fillAfterStrokeEnabled).toBe(true);
  });

  it('looks the same relative to the photo at any resolution (screen vs flattened copy)', () => {
    const annotation: Annotation = { kind: 'arrow', points: [0.1, 0.1, 0.9, 0.9], color: RED };
    const full = shapeSpec(annotation, PHOTO);
    const half = shapeSpec(annotation, { width: 800, height: 600 });
    if (full.type !== 'Arrow' || half.type !== 'Arrow') throw new Error('not an arrow');
    expect(half.config.strokeWidth! * 2).toBeCloseTo(full.config.strokeWidth!);
    expect(half.config.pointerLength! * 2).toBeCloseTo(full.config.pointerLength!);
    expect(half.config.shadowBlur! * 2).toBeCloseTo(full.config.shadowBlur!);
    expect(half.config.points!.map((value) => value * 2)).toEqual(full.config.points);
  });
});

describe('shapeSpecs', () => {
  const arrow = (color: string): Annotation => ({
    kind: 'arrow',
    points: [0.1, 0.1, 0.9, 0.9],
    color,
  });

  it('draws red and cyan marks as they are, with their soft shadow only', () => {
    for (const color of [RED, ANNOTATION_COLORS.cyan]) {
      expect(shapeSpecs(arrow(color), PHOTO)).toEqual([shapeSpec(arrow(color), PHOTO)]);
    }
  });

  it('puts a wider, dark, unpickable copy under yellow and white lines', () => {
    for (const color of [ANNOTATION_COLORS.yellow, ANNOTATION_COLORS.white]) {
      const [outline, mark] = shapeSpecs(arrow(color), PHOTO);
      expect(mark).toEqual(shapeSpec(arrow(color), PHOTO));
      if (outline?.type !== 'Arrow' || mark?.type !== 'Arrow') throw new Error('not arrows');
      expect(outline.config.points).toEqual(mark.config.points);
      expect(outline.config.stroke).toMatch(/^rgba\(0, 0, 0, 0\.\d+\)$/);
      expect(outline.config.fill).toBe(outline.config.stroke);
      expect(outline.config.strokeWidth).toBeCloseTo(mark.config.strokeWidth! * 1.7);
      expect(outline.config.listening).toBe(false);
      expect(outline.config.shadowEnabled).toBe(false);
    }
  });

  it('outlines every kind of line, matched case-insensitively', () => {
    const yellow = ANNOTATION_COLORS.yellow.toLowerCase();
    const box = { x: 0.2, y: 0.2, w: 0.3, h: 0.3, color: yellow };
    const kinds: Annotation[] = [
      { kind: 'rect', ...box },
      { kind: 'ellipse', ...box },
      { kind: 'freehand', points: [0.1, 0.1, 0.2, 0.3], color: yellow },
    ];
    for (const annotation of kinds) {
      const specs = shapeSpecs(annotation, PHOTO);
      expect(specs).toHaveLength(2);
      expect(specs[0]!.type).toBe(specs[1]!.type);
    }
  });

  it('leaves labels alone: they have their own outline', () => {
    const label: Annotation = {
      kind: 'text',
      x: 0.5,
      y: 0.5,
      text: 'Check',
      color: ANNOTATION_COLORS.white,
      size: 0.05,
    };
    expect(shapeSpecs(label, PHOTO)).toEqual([shapeSpec(label, PHOTO)]);
  });
});
