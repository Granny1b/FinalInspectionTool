/**
 * Loaded only when someone exports (WordExportButton imports it on click), so the `docx` library
 * never weighs on the app's main bundle.
 */
import { Packer } from 'docx';
import { printedImageIds, type PrintModel } from '../print/model';
import { DEFAULT_LOGO_URL } from '../print/usePrintImages';
import { readImage, type WordImage } from './images';
import { wordDocument } from './wordDocument';

type Sources = {
  /** With the reference images. */
  appendix: boolean;
  /** The settings' own logo; without one, the bundled Modig logo. */
  logoImageId: string | undefined;
  /** A fresh read URL for an uploaded image. */
  imageUrl: (imageId: string) => Promise<string>;
};

/** Builds the printout as a .docx in the browser and saves it under the printout's name. */
export async function exportWord(model: PrintModel, sources: Sources): Promise<void> {
  const ids = printedImageIds(model, { appendix: sources.appendix });
  // A fresh URL, as for the photos: the preview's may have expired by now.
  const logoUrl = sources.logoImageId
    ? sources.imageUrl(sources.logoImageId).catch(() => DEFAULT_LOGO_URL)
    : Promise.resolve(DEFAULT_LOGO_URL);
  const [logo, ...loaded] = await Promise.all([
    logoUrl.then(loadImage),
    ...ids.map((id) => sources.imageUrl(id).then(loadImage, () => null)),
  ]);
  const photos = new Map(
    ids.flatMap((id, index) => {
      const image = loaded[index];
      return image ? [[id, image] as const] : [];
    }),
  );
  const file = wordDocument(model, {
    appendix: sources.appendix,
    images: { photos, logo: logo ?? null },
  });
  save(await Packer.toBlob(file), wordFileName(model.fileName));
}

/** The longest file name, without ".docx". */
const FILE_NAME_LENGTH = 150;

/**
 * "FI-2026-0042 RigiMill MG – Volvo Skövde – Inspection report.docx": the PDF's name, with the
 * characters Windows and macOS refuse in file names replaced, and not too long. A long name is
 * shortened before its last part ("– Blank checklist"), so a blank and a report export never get
 * the same name.
 */
export function wordFileName(name: string): string {
  let safe = name
    .replace(/\s+/g, ' ')
    // eslint-disable-next-line no-control-regex -- control characters are exactly what is replaced
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '-')
    .trim();
  if (safe.length > FILE_NAME_LENGTH) {
    const last = safe.lastIndexOf(' – ');
    const kind = last > 0 && safe.length - last <= 40 ? safe.slice(last) : '';
    safe = `${safe.slice(0, FILE_NAME_LENGTH - kind.length - 1).trimEnd()}…${kind}`;
  }
  safe = safe.replace(/[\s.]+$/, '');
  return `${safe || 'Final inspection'}.docx`;
}

/**
 * An image's bytes, format and size; null when it can't be fetched or read, and the document then
 * says so in its place (like print). Read URLs allow a CORS GET from the app, but the preview's
 * images were loaded without CORS: their cached copies carry no CORS headers, so the cache is
 * skipped.
 */
async function loadImage(url: string): Promise<WordImage | null> {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return null;
    return readImage(new Uint8Array(await response.arrayBuffer()));
  } catch {
    return null;
  }
}

function save(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // The download has started from the URL by then; a moment later it can go.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
