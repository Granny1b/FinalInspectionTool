import type { APIRequestContext, Browser } from '@playwright/test';

/**
 * A photo-like JPEG drawn by the browser itself, so the repository needs no image files: a grey
 * machine with a blue stripe and a cabinet on a light floor. No red or yellow anywhere, so a red
 * mark drawn on it can be told apart in the flattened copy.
 */
export async function testPhoto(
  browser: Browser,
  { width, height, label }: { width: number; height: number; label: string },
): Promise<Buffer> {
  const page = await browser.newPage({ viewport: { width, height } });
  try {
    await page.setContent(`
      <body style="margin:0;height:100vh;background:linear-gradient(#d9dde2,#9aa3ad);font:600 ${Math.round(height / 14)}px sans-serif">
        <div style="position:absolute;left:12%;top:18%;width:52%;height:58%;background:#eef0f2;border:4px solid #59626c"></div>
        <div style="position:absolute;left:12%;top:47%;width:52%;height:7%;background:#2b6fa3"></div>
        <div style="position:absolute;left:70%;top:28%;width:18%;height:48%;background:#6b7580"></div>
        <div style="position:absolute;left:14%;top:22%;color:#3a434c">${label}</div>
      </body>`);
    return await page.screenshot({ type: 'jpeg', quality: 85 });
  } finally {
    await page.close();
  }
}

/** Uploads a JPEG the way the app does (upload URL from the API, PUT to storage): its image id. */
export async function uploadPhoto(request: APIRequestContext, jpeg: Buffer): Promise<string> {
  const response = await request.post('/api/images/upload-url');
  if (!response.ok()) throw new Error(`upload-url: ${response.status()}`);
  const { imageId, sasUrl } = (await response.json()) as { imageId: string; sasUrl: string };
  const put = await fetch(sasUrl, {
    method: 'PUT',
    headers: { 'x-ms-blob-type': 'BlockBlob', 'content-type': 'image/jpeg' },
    body: new Uint8Array(jpeg),
  });
  if (!put.ok) throw new Error(`photo upload: ${put.status}`);
  return imageId;
}

/** Width and height from a JPEG's frame header. */
export function jpegSize(jpeg: Buffer): { width: number; height: number } {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('Not a JPEG');
  let offset = 2;
  while (offset < jpeg.length) {
    const marker = jpeg[offset + 1]!;
    // SOF0–SOF3: baseline, extended, progressive, lossless.
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: jpeg.readUInt16BE(offset + 5), width: jpeg.readUInt16BE(offset + 7) };
    }
    offset += 2 + jpeg.readUInt16BE(offset + 2);
  }
  throw new Error('No JPEG frame header found');
}
