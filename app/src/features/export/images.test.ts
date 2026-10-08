import { describe, expect, it } from 'vitest';
import { fitWithin, readImage } from './images';

/** A PNG header: signature, then the IHDR chunk with width and height. */
function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

/** A JPEG header: SOI, an APP0 segment, a fill byte, then a frame header (SOFn) with the size. */
function jpeg(width: number, height: number, frame = 0xc0): Uint8Array {
  const bytes = new Uint8Array(40);
  bytes.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46, 0xff, 0xff, frame, 0x00, 0x11, 0x08]);
  const view = new DataView(bytes.buffer);
  view.setUint16(14, height);
  view.setUint16(16, width);
  return bytes;
}

describe('readImage', () => {
  it('reads a JPEG’s size from its frame header, also a progressive one', () => {
    expect(readImage(jpeg(1600, 1200))).toMatchObject({ type: 'jpg', width: 1600, height: 1200 });
    expect(readImage(jpeg(900, 1600, 0xc2))).toMatchObject({
      type: 'jpg',
      width: 900,
      height: 1600,
    });
  });

  it('reads a PNG’s size from its IHDR chunk', () => {
    expect(readImage(png(512, 128))).toMatchObject({ type: 'png', width: 512, height: 128 });
  });

  it('keeps the bytes to embed', () => {
    const data = png(2, 1);
    expect(readImage(data)?.data).toBe(data);
  });

  it('refuses anything else, and damaged or empty headers', () => {
    expect(
      readImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')),
    ).toBeNull();
    expect(readImage(new Uint8Array([0xff, 0xd8, 0x00, 0x01]))).toBeNull();
    expect(readImage(jpeg(0, 0))).toBeNull();
    expect(readImage(png(10, 10).slice(0, 20))).toBeNull();
  });
});

describe('fitWithin', () => {
  it('scales an image into a box keeping its proportions, up or down', () => {
    expect(fitWithin({ width: 1600, height: 1200 }, { width: 120, height: 80 })).toEqual({
      width: (80 * 4) / 3,
      height: 80,
    });
    expect(fitWithin({ width: 400, height: 100 }, { width: 120, height: 80 })).toEqual({
      width: 120,
      height: 30,
    });
  });
});
