/**
 * Reads the PDFs that Chromium prints (`page.pdf`) for the print tests: each page's size, its
 * text with positions, and how many images it paints. pdfjs-dist works in PDF points (1/72 inch)
 * from the bottom-left corner; here positions are measured from the top-left, like the layout.
 */
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

/** PDF points per millimetre. */
export const MM = 72 / 25.4;

/** One run of text as Chromium wrote it: a line of a cell, a label, a footer box. */
export type PdfText = {
  text: string;
  /** Left and right edge, from the page's left edge. */
  x: number;
  right: number;
  /** The baseline, from the page's top edge. */
  y: number;
  /** Font size in points. */
  size: number;
};

export type PdfPage = {
  /** 1-based. */
  number: number;
  width: number;
  height: number;
  /** In the order Chromium painted them, which is document order. */
  texts: PdfText[];
  /** Images painted on the page: photos and the logo (status marks are vector drawings). */
  images: number;
};

const IMAGE_OPS = new Set<number>([OPS.paintImageXObject, OPS.paintInlineImageXObject]);

export async function readPdf(bytes: Uint8Array): Promise<PdfPage[]> {
  // pdfjs takes over (detaches) the buffer it is given, so it gets a copy.
  const task = getDocument({ data: new Uint8Array(bytes), verbosity: 0 });
  const document = await task.promise;
  try {
    const pages: PdfPage[] = [];
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number);
      const { width, height } = page.getViewport({ scale: 1 });
      const texts: PdfText[] = [];
      for (const item of (await page.getTextContent()).items) {
        if (!('str' in item) || !item.str.trim()) continue;
        const [size, , , , x, baseline] = item.transform as number[];
        texts.push({
          text: item.str,
          x: x!,
          right: x! + item.width,
          y: height - baseline!,
          size: size!,
        });
      }
      const { fnArray } = await page.getOperatorList();
      const images = fnArray.filter((op) => IMAGE_OPS.has(op)).length;
      pages.push({ number, width, height, texts, images });
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

/**
 * Text without any whitespace, so a checkpoint wrapped over several lines of a cell still
 * matches its one-line original.
 */
export function compact(text: string): string {
  return text.replace(/\s+/g, '');
}

/** All of a page's text, compacted, in document order. */
export function pageText(page: PdfPage): string {
  return compact(page.texts.map((text) => text.text).join(''));
}

/** The text in the page's bottom margin (16 mm): the footer's margin boxes. */
export function footerTexts(page: PdfPage): PdfText[] {
  return page.texts.filter((text) => text.y > page.height - 16 * MM);
}
