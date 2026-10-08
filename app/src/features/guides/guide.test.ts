import {
  GuideSchema,
  type AnnotatedImage,
  type Annotation,
  type GuideImage,
  type Section,
} from '@modig/shared';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VERDICT,
  guideDraft,
  guideRow,
  imageCountText,
  sameGuide,
  savedGuide,
  updateImage,
  withVerdicts,
} from './guide';

const ARROW: Annotation = { kind: 'arrow', points: [0.1, 0.2, 0.3, 0.4], color: '#E02424' };

function image(imageId: string, patch: Partial<GuideImage> = {}): GuideImage {
  return { imageId, annotations: [], verdict: 'good', ...patch };
}

describe('savedGuide', () => {
  it('is no guide when there is neither a description nor an image', () => {
    expect(savedGuide({ description: '', images: [] })).toBeUndefined();
    expect(savedGuide({ description: ' \n\t ', images: [] })).toBeUndefined();
  });

  it('keeps a description alone, trimmed', () => {
    expect(savedGuide({ description: '  Marked screws.\n', images: [] })).toEqual({
      description: 'Marked screws.',
      images: [],
    });
  });

  it('keeps images alone, without an empty description', () => {
    const saved = savedGuide({ description: '  ', images: [image('imgAAAAAAAAAAAAA')] });
    expect(saved).toEqual({ images: [image('imgAAAAAAAAAAAAA')] });
    expect(saved).not.toHaveProperty('description');
  });

  it('trims captions and leaves out empty ones', () => {
    const saved = savedGuide({
      description: '',
      images: [image('a', { caption: '  Good seal ' }), image('b', { caption: '   ' })],
    });
    expect(saved?.images.map((stored) => stored.caption)).toEqual(['Good seal', undefined]);
    expect(saved?.images[1]).not.toHaveProperty('caption');
  });

  it('writes keys in the schema order whatever order the editor built them in', () => {
    // Built back to front, as an edit in the gallery would: verdict first, caption last.
    const scrambled: GuideImage = {
      verdict: 'bad',
      renderedImageId: 'renderedAAAAAAAA',
      annotations: [ARROW],
      imageId: 'imageAAAAAAAAAAA',
      caption: 'Paint line broken',
    };
    const saved = savedGuide({ description: 'Both sides', images: [scrambled] });
    expect(JSON.stringify(saved)).toBe(JSON.stringify(GuideSchema.parse(saved)));
    expect(Object.keys(saved?.images[0] ?? {})).toEqual([
      'imageId',
      'caption',
      'annotations',
      'renderedImageId',
      'verdict',
    ]);
  });
});

describe('guideDraft and sameGuide', () => {
  it('opens an empty draft for a row without a guide, which saves as no guide', () => {
    expect(guideDraft(undefined)).toEqual({ description: '', images: [] });
    expect(sameGuide(savedGuide(guideDraft(undefined)), undefined)).toBe(true);
  });

  it('sees no change in a stored guide opened and saved again', () => {
    const stored = GuideSchema.parse({
      description: 'Screws marked',
      images: [image('imageAAAAAAAAAAA', { caption: 'OK', annotations: [ARROW] })],
    });
    expect(sameGuide(savedGuide(guideDraft(stored)), stored)).toBe(true);
  });

  it('sees a changed verdict, caption or description', () => {
    const stored = { description: 'Screws marked', images: [image('a')] };
    const draft = guideDraft(stored);
    expect(sameGuide(savedGuide({ ...draft, description: 'Screws' }), stored)).toBe(false);
    const bad = updateImage(draft.images, 0, { verdict: 'bad' });
    expect(sameGuide(savedGuide({ ...draft, images: bad }), stored)).toBe(false);
    const captioned = updateImage(draft.images, 0, { caption: 'Seal' });
    expect(sameGuide(savedGuide({ ...draft, images: captioned }), stored)).toBe(false);
  });
});

describe('withVerdicts', () => {
  const previous = [image('a', { verdict: 'good' }), image('b', { verdict: 'bad' })];

  it('gives a new image the default verdict, Info', () => {
    const added: AnnotatedImage = { imageId: 'c', annotations: [] };
    expect(DEFAULT_VERDICT).toBe('info');
    expect(withVerdicts([...previous, added], previous).map((one) => one.verdict)).toEqual([
      'good',
      'bad',
      'info',
    ]);
  });

  it('keeps the verdict of an image back from the editor (same image id)', () => {
    const edited: AnnotatedImage = { imageId: 'b', annotations: [ARROW], renderedImageId: 'r' };
    const images = withVerdicts([previous[0]!, edited], previous);
    expect(images[1]).toEqual({ ...edited, verdict: 'bad' });
  });

  it('follows a removal', () => {
    expect(withVerdicts([previous[1]!], previous)).toEqual([previous[1]]);
  });
});

describe('updateImage', () => {
  it('changes only the image at the index, without touching the list', () => {
    const images = [image('a'), image('b')];
    const next = updateImage(images, 1, { verdict: 'info', caption: 'Detail' });
    expect(next).toEqual([image('a'), image('b', { verdict: 'info', caption: 'Detail' })]);
    expect(next[0]).toBe(images[0]);
    expect(images[1]!.verdict).toBe('good');
  });
});

describe('guideRow', () => {
  const sections: Section[] = [
    { id: 's1', title: 'Loading area', items: [{ id: 'a', text: 'Lifting columns' }] },
    {
      id: 's2',
      title: 'Tool arena',
      items: [
        { id: 'b', text: 'Tool changer' },
        { id: 'c', text: 'Spindle cone', guide: { images: [] } },
      ],
    },
  ];

  it('finds the row with its derived ref and its guide', () => {
    expect(guideRow(sections, 'c')).toEqual({
      ref: '2.b',
      text: 'Spindle cone',
      guide: { images: [] },
    });
    expect(guideRow(sections, 'a')).toEqual({
      ref: '1.a',
      text: 'Lifting columns',
      guide: undefined,
    });
  });

  it('is null for a row that is not there', () => {
    expect(guideRow(sections, 'zzz')).toBeNull();
  });
});

describe('imageCountText', () => {
  it('counts images', () => {
    expect(imageCountText(1)).toBe('1 image');
    expect(imageCountText(6)).toBe('6 images');
  });
});
