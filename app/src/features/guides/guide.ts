/**
 * Guides (brief §5.4): what a checkpoint should and shouldn't look like, as a short description
 * and reference images tagged Good / Bad / Info. Pure helpers for the guide editor and viewer.
 */
import {
  rowRef,
  type AnnotatedImage,
  type Guide,
  type GuideImage,
  type GuideVerdict,
  type Section,
} from '@modig/shared';

/** A new image makes no claim until the admin calls it Good or Bad. */
export const DEFAULT_VERDICT: GuideVerdict = 'info';

/** What the guide editor edits: the description as typed, the images as they are. */
export type GuideDraft = { description: string; images: GuideImage[] };

export function guideDraft(guide: Guide | undefined): GuideDraft {
  return { description: guide?.description ?? '', images: guide?.images ?? [] };
}

/**
 * The guide as stored, or undefined when there is nothing in it: an empty guide is no guide.
 * Texts lose surrounding whitespace and empty ones are left out. Keys come in the schema's order,
 * as in the server's copy, because the draft's unpublished-changes check compares JSON.
 */
export function savedGuide({ description, images }: GuideDraft): Guide | undefined {
  const text = description.trim();
  if (!text && images.length === 0) return undefined;
  return { ...(text && { description: text }), images: images.map(savedImage) };
}

function savedImage({
  imageId,
  caption,
  annotations,
  renderedImageId,
  verdict,
}: GuideImage): GuideImage {
  const text = caption?.trim();
  return {
    imageId,
    ...(text && { caption: text }),
    annotations,
    ...(renderedImageId && { renderedImageId }),
    verdict,
  };
}

/** The same guide, as `savedGuide` writes them (no guide equals no guide). */
export function sameGuide(a: Guide | undefined, b: Guide | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * The images after the photo list changed them. A photo back from the annotation editor knows
 * nothing of verdicts, so each keeps the verdict its image had (images keep their id when edited);
 * a new one gets the default.
 */
export function withVerdicts(
  photos: readonly AnnotatedImage[],
  previous: readonly GuideImage[],
): GuideImage[] {
  return photos.map((photo) => ({
    ...photo,
    verdict: previous.find((image) => image.imageId === photo.imageId)?.verdict ?? DEFAULT_VERDICT,
  }));
}

/** One image's verdict or caption changed in the gallery. */
export function updateImage(
  images: readonly GuideImage[],
  index: number,
  patch: Partial<Pick<GuideImage, 'verdict' | 'caption'>>,
): GuideImage[] {
  return images.map((image, at) => (at === index ? { ...image, ...patch } : image));
}

/** A row's ref ("3.c"), text and guide, for the guide dialogs; null for an unknown row. */
export function guideRow(
  sections: readonly Section[],
  itemId: string,
): { ref: string; text: string; guide: Guide | undefined } | null {
  for (const [sectionIndex, section] of sections.entries()) {
    const rowIndex = section.items.findIndex((item) => item.id === itemId);
    const item = section.items[rowIndex];
    if (item) return { ref: rowRef(sectionIndex, rowIndex), text: item.text, guide: item.guide };
  }
  return null;
}

/** "1 image", "3 images". */
export function imageCountText(count: number): string {
  return count === 1 ? '1 image' : `${count} images`;
}
