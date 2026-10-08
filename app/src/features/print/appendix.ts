/**
 * The "Include reference images" appendix (brief §6): every checklist row whose guide has images,
 * in checklist order, with its guide's description and the images two to a row, each captioned
 * with the row's ref and the image's verdict. Pure, so the rules are unit-tested; print and the
 * Word export lay it out.
 */
import {
  GUIDE_VERDICT_LABELS,
  rowLetter,
  sectionNumber,
  type GuideVerdict,
  type Section,
} from '@modig/shared';

export const APPENDIX_TITLE = 'Appendix · Reference images';

/** Brief §6: "2 per row". */
export const APPENDIX_IMAGES_PER_ROW = 2;

/** The verdict's symbol next to its word, never colour alone (brief §5.4: Good ✓ / Bad ✗ / Info). */
export const VERDICT_SYMBOLS: Record<GuideVerdict, string> = { good: '✓', bad: '✗', info: 'ⓘ' };

export type AppendixImage = {
  /** The flattened copy with the annotations when there is one, else the image itself. */
  imageId: string;
  verdict: GuideVerdict;
  /** The row's ref, "3.c": every caption names it, so an image read on its own is placed. */
  ref: string;
  /** The image's own caption; may be empty. */
  caption: string;
};

export type AppendixEntry = {
  /** "3.c" */
  ref: string;
  /** The checkpoint text. */
  text: string;
  /** The guide's "what good looks like"; may be empty. */
  description: string;
  /** The images in rows of APPENDIX_IMAGES_PER_ROW; the last row may hold fewer. */
  rows: AppendixImage[][];
};

/** Rows with guide images, in checklist order; rows without (or with an empty guide) are skipped. */
export function appendixEntries(sections: readonly Section[]): AppendixEntry[] {
  return sections.flatMap((section, sectionIndex) =>
    section.items.flatMap((item, rowIndex) => {
      const images = item.guide?.images ?? [];
      if (images.length === 0) return [];
      const ref = `${sectionNumber(sectionIndex)}.${rowLetter(rowIndex)}`;
      return [
        {
          ref,
          text: item.text.trim(),
          description: item.guide?.description?.trim() ?? '',
          rows: chunk(
            images.map((image) => ({
              imageId: image.renderedImageId ?? image.imageId,
              verdict: image.verdict,
              ref,
              caption: image.caption?.trim() ?? '',
            })),
            APPENDIX_IMAGES_PER_ROW,
          ),
        },
      ];
    }),
  );
}

/** "3.c · ✓ Good": the bold start of an image's caption, as text (print draws the symbol as an icon). */
export function captionLabel({ ref, verdict }: Pick<AppendixImage, 'ref' | 'verdict'>): string {
  return `${ref} · ${VERDICT_SYMBOLS[verdict]} ${GUIDE_VERDICT_LABELS[verdict]}`;
}

/** Every image the appendix prints, in order. */
export function appendixImageIds(entries: readonly AppendixEntry[]): string[] {
  return entries.flatMap((entry) => entry.rows.flat().map((image) => image.imageId));
}

/** [a, b, c] in twos → [[a, b], [c]]. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}
