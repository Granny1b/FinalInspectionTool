/**
 * Images for the Word export: Word needs each image's format and pixel size up front, so both are
 * read from the file's header (the app's photos are JPEG, the default logo PNG). Pure, so it runs
 * in tests without a browser.
 */

/** An image ready to embed: its bytes, format and size in pixels. */
export type WordImage = { data: Uint8Array; type: 'jpg' | 'png'; width: number; height: number };

/** A width and height in millimetres. */
export type Box = { width: number; height: number };

/** A JPEG or PNG with its format and size; null for anything else or a damaged header. */
export function readImage(data: Uint8Array): WordImage | null {
  const png = isPng(data);
  const size = png ? pngSize(data) : isJpeg(data) ? jpegSize(data) : null;
  if (!size || size.width <= 0 || size.height <= 0) return null;
  return { data, type: png ? 'png' : 'jpg', ...size };
}

/**
 * The size in mm of an image (only its proportions count) scaled to fit `box`, like
 * `object-fit: contain` on paper: as large as the box allows, never cropped.
 */
export function fitWithin({ width, height }: Box, box: Box): Box {
  const scale = Math.min(box.width / width, box.height / height);
  return { width: width * scale, height: height * scale };
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function isPng(data: Uint8Array): boolean {
  return PNG_SIGNATURE.every((byte, index) => data[index] === byte);
}

function isJpeg(data: Uint8Array): boolean {
  return data[0] === 0xff && data[1] === 0xd8;
}

/** The IHDR chunk always comes first: width and height at bytes 16 and 20. */
function pngSize(data: Uint8Array): { width: number; height: number } | null {
  if (data.length < 24) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** Walks the segments to the first frame header (SOF0–SOF15 but DHT, JPG and DAC). */
function jpegSize(data: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 2;
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) return null;
    const marker = data[offset + 1]!;
    if (marker === 0xff) {
      offset += 1; // Fill byte before a marker.
      continue;
    }
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
    }
    // Markers without a length: TEM and the restart markers.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    offset += 2 + view.getUint16(offset + 2);
  }
  return null;
}
