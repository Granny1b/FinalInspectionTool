import type { AnnotatedImage, Annotation } from '@modig/shared';
import { describe, expect, it } from 'vitest';
import { firstImageFile, needsRender, savedPhoto, shownImageId } from './photos';

const ARROW: Annotation = { kind: 'arrow', points: [0.1, 0.1, 0.5, 0.5], color: '#E02424' };
const BOX: Annotation = { kind: 'rect', x: 0.2, y: 0.2, w: 0.3, h: 0.3, color: '#E02424' };
const PHOTO_ID = 'photo0000000001';
const RENDER_ID = 'render000000001';

describe('shownImageId', () => {
  it('shows the flattened copy when there is one, else the photo', () => {
    expect(shownImageId({ imageId: PHOTO_ID, annotations: [] })).toBe(PHOTO_ID);
    expect(
      shownImageId({ imageId: PHOTO_ID, annotations: [ARROW], renderedImageId: RENDER_ID }),
    ).toBe(RENDER_ID);
  });
});

describe('firstImageFile', () => {
  it('picks the first image, skipping other files', () => {
    const text = new File(['notes'], 'notes.txt', { type: 'text/plain' });
    const photo = new File([new Uint8Array([1])], 'photo.jpg', { type: 'image/jpeg' });
    const png = new File([new Uint8Array([2])], 'shot.png', { type: 'image/png' });
    expect(firstImageFile([text, photo, png])).toBe(photo);
  });

  it('gives null when there is no image', () => {
    expect(firstImageFile([])).toBeNull();
    expect(firstImageFile([new File(['x'], 'a.pdf', { type: 'application/pdf' })])).toBeNull();
  });
});

describe('needsRender', () => {
  const stored: AnnotatedImage = {
    imageId: PHOTO_ID,
    annotations: [ARROW],
    renderedImageId: RENDER_ID,
  };

  it('flattens a new photo with marks', () => {
    expect(needsRender(null, [ARROW])).toBe(true);
  });

  it('flattens nothing without marks', () => {
    expect(needsRender(null, [])).toBe(false);
    expect(needsRender(stored, [])).toBe(false);
  });

  it('keeps the flattened copy while the marks are unchanged (a caption edit)', () => {
    expect(needsRender(stored, [{ ...ARROW }])).toBe(false);
  });

  it('flattens again when the marks changed', () => {
    expect(needsRender(stored, [ARROW, BOX])).toBe(true);
    expect(needsRender(stored, [{ ...ARROW, color: '#FFFFFF' }])).toBe(true);
  });

  it('flattens marks that were never flattened', () => {
    expect(needsRender({ imageId: PHOTO_ID, annotations: [ARROW] }, [ARROW])).toBe(true);
  });
});

describe('savedPhoto', () => {
  it('stores the photo, its marks and the flattened copy', () => {
    expect(
      savedPhoto({
        imageId: PHOTO_ID,
        caption: '  Cable chafing on the guard  ',
        annotations: [ARROW],
        renderedImageId: RENDER_ID,
      }),
    ).toEqual({
      imageId: PHOTO_ID,
      caption: 'Cable chafing on the guard',
      annotations: [ARROW],
      renderedImageId: RENDER_ID,
    });
  });

  it('leaves out an empty caption', () => {
    const photo = savedPhoto({
      imageId: PHOTO_ID,
      caption: '   ',
      annotations: [],
      renderedImageId: undefined,
    });
    expect(photo).toEqual({ imageId: PHOTO_ID, annotations: [] });
    expect('caption' in photo).toBe(false);
  });

  it('drops a flattened copy once every mark is removed (print uses the photo)', () => {
    expect(
      savedPhoto({ imageId: PHOTO_ID, caption: '', annotations: [], renderedImageId: RENDER_ID }),
    ).toEqual({ imageId: PHOTO_ID, annotations: [] });
  });
});
