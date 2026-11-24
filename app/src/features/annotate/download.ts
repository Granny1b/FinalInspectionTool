/**
 * Saving a picture to the device: the picture as it is shown (with what was drawn on it), as a
 * JPEG file named after what it belongs to.
 */

/** "Photo 2 – FI-2026-0042 D-01.jpg": a file name without the characters file systems refuse. */
export function pictureFileName(title: string, label: string): string {
  const name = [title, label]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' – ')
    .replace(/\s+/g, ' ')
    // eslint-disable-next-line no-control-regex -- control characters are exactly what is replaced
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '-')
    .slice(0, 120)
    .replace(/[\s.]+$/, '');
  return `${name || 'Picture'}.jpg`;
}

/**
 * Downloads the picture at `url` as `fileName`. The picture is on the storage account's address,
 * where a link's `download` is ignored, so it is fetched first and saved from the browser.
 */
export async function downloadPicture(url: string, fileName: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`The picture could not be fetched (${response.status}).`);
  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // The download has started from the URL by then; a moment later it can go.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}
