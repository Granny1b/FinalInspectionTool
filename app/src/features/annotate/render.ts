/**
 * The flattened copy of an annotated photo for thumbnails and print: the photo and its marks drawn
 * at the photo's own resolution, as a JPEG. Drawn from the same shape configs as the editor, so it
 * looks like what was drawn.
 */
import type { Annotation } from '@modig/shared';
import type { Shape } from 'konva/lib/Shape';
import type { Size } from './geometry';
import { Arrow, Ellipse, Image, Konva, Line, Rect, Text } from './konva';
import { LABEL_FONT_FAMILY, LABEL_FONT_STYLE, shapeSpec, type ShapeSpec } from './style';

/** Higher than the photos' 0.8: JPEG blurs thin lines and small text first. */
const RENDER_JPEG_QUALITY = 0.9;

/**
 * Draws `image` at `size` with the annotations on top and encodes it as JPEG. The image must be
 * same-origin or loaded with CORS (`crossOrigin = 'anonymous'`), or the canvas can't be exported.
 */
export async function renderAnnotatedJpeg(
  image: HTMLImageElement,
  size: Size,
  annotations: readonly Annotation[],
): Promise<Blob> {
  // Text labels are drawn in the bundled Inter; make sure it is loaded before drawing.
  await document.fonts.load(`${LABEL_FONT_STYLE} 32px ${LABEL_FONT_FAMILY}`);
  const stage = new Konva.Stage({ container: document.createElement('div'), ...size });
  try {
    const layer = new Konva.Layer();
    stage.add(layer);
    layer.add(new Image({ image, ...size }));
    for (const annotation of annotations) layer.add(createShape(shapeSpec(annotation, size)));
    return await toJpeg(stage.toCanvas({ pixelRatio: 1 }));
  } finally {
    stage.destroy();
  }
}

function createShape(spec: ShapeSpec): Shape {
  switch (spec.type) {
    case 'Arrow':
      return new Arrow(spec.config);
    case 'Line':
      return new Line(spec.config);
    case 'Rect':
      return new Rect(spec.config);
    case 'Ellipse':
      return new Ellipse(spec.config);
    case 'Text':
      return new Text(spec.config);
  }
}

function toJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('The annotated photo could not be encoded.')),
      'image/jpeg',
      RENDER_JPEG_QUALITY,
    ),
  );
}
