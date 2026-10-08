import type { AnnotatedImage, InspectionDeviation } from '@modig/shared';
import { describe, expect, it } from 'vitest';
import { asksBeforeRemoving, photoCountText, removalMessage } from './deviations';

const photo: AnnotatedImage = { imageId: 'Img0000000000001', annotations: [] };
const empty: InspectionDeviation = {
  number: 'D-03',
  kind: 'extra',
  key: 'Extr00000000000a',
  itemId: null,
  sectionTitle: '',
  ref: '—',
  text: '',
  comment: '',
  severity: 'minor',
  resp: '',
  photos: [],
};

describe('photoCountText', () => {
  it('counts photos in words, and says nothing for none', () => {
    expect(photoCountText(0)).toBeNull();
    expect(photoCountText(1)).toBe('1 photo');
    expect(photoCountText(2)).toBe('2 photos');
  });
});

describe('asksBeforeRemoving', () => {
  it('removes an untouched extra deviation at once', () => {
    expect(asksBeforeRemoving(empty)).toBe(false);
    expect(asksBeforeRemoving({ ...empty, text: '  ', comment: ' ', resp: '\t' })).toBe(false);
  });

  it('asks when anything was typed or photographed', () => {
    expect(asksBeforeRemoving({ ...empty, text: 'Paint damage' })).toBe(true);
    expect(asksBeforeRemoving({ ...empty, comment: 'See photo' })).toBe(true);
    expect(asksBeforeRemoving({ ...empty, resp: 'Mekanik' })).toBe(true);
    expect(asksBeforeRemoving({ ...empty, photos: [photo] })).toBe(true);
  });
});

describe('removalMessage', () => {
  it('names the deviation by its description, else its comment or resp', () => {
    expect(removalMessage({ ...empty, text: ' Paint damage ', comment: 'x' })).toBe(
      '“Paint damage” is removed from the summary.',
    );
    expect(removalMessage({ ...empty, comment: 'Scratch on the door' })).toBe(
      '“Scratch on the door” is removed from the summary.',
    );
    expect(removalMessage({ ...empty, resp: 'Mekanik' })).toBe(
      '“Mekanik” is removed from the summary.',
    );
  });

  it('says that its photos go with it', () => {
    expect(removalMessage({ ...empty, text: 'Paint damage', photos: [photo, photo] })).toBe(
      '“Paint damage” is removed from the summary, with its 2 photos.',
    );
    expect(removalMessage({ ...empty, photos: [photo] })).toBe(
      'It is removed from the summary, with its photo.',
    );
  });
});
