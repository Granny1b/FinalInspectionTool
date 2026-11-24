import { describe, expect, it } from 'vitest';
import { pictureFileName } from './download';

describe('pictureFileName', () => {
  it('names the file after the picture and what it belongs to', () => {
    expect(pictureFileName('Picture 2', 'Pictures · 1.3')).toBe('Picture 2 – Pictures · 1.3.jpg');
    expect(pictureFileName('Photo 1', '')).toBe('Photo 1.jpg');
    expect(pictureFileName(' ', ' ')).toBe('Picture.jpg');
  });

  it('replaces what a file name can’t have, and is not too long', () => {
    expect(pictureFileName('Photo 1', 'FI-2026-0042 / D-01: "bent"?')).toBe(
      'Photo 1 – FI-2026-0042 - D-01- -bent--.jpg',
    );
    expect(pictureFileName('x'.repeat(300), '').length).toBe(124);
  });
});
