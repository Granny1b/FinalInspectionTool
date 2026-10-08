/** Small pure helpers for a list of annotated photos. */
import type { AnnotatedImage, Annotation } from '@modig/shared';
import { sameAnnotations } from './editorState';

/** What a thumbnail, the viewer and print show: the flattened copy when there is one. */
export function shownImageId(photo: AnnotatedImage): string {
  return photo.renderedImageId ?? photo.imageId;
}

/** The first image among dropped or pasted files (anything else is ignored). */
export function firstImageFile(files: Iterable<File> | ArrayLike<File>): File | null {
  return Array.from(files).find((file) => file.type.startsWith('image/')) ?? null;
}

/**
 * Text pasted into a text field stays text, even when the clipboard also holds a picture of it
 * (Excel and Word put both there). An image copied in a browser comes with HTML but no plain
 * text, so it is still added.
 */
export function pastesText(event: {
  target: EventTarget | null;
  clipboardData: Pick<DataTransfer, 'getData'> | null;
}): boolean {
  const target = event.target as Partial<HTMLElement> | null;
  const field =
    target?.tagName === 'INPUT' ||
    target?.tagName === 'TEXTAREA' ||
    target?.isContentEditable === true;
  return field && (event.clipboardData?.getData('text/plain') ?? '') !== '';
}

/**
 * Whether the browser can draw the file, so it can be marked up and saved: Chrome can't decode
 * HEIC, and no browser makes a bitmap of an SVG.
 */
export async function canDecode(file: Blob): Promise<boolean> {
  try {
    (await createImageBitmap(file)).close();
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether saving must flatten the photo again: it has marks, and they changed or were never
 * flattened. Without marks there is nothing to flatten; print uses the photo itself.
 */
export function needsRender(
  before: AnnotatedImage | null,
  annotations: readonly Annotation[],
): boolean {
  if (annotations.length === 0) return false;
  return !before?.renderedImageId || !sameAnnotations(before.annotations, annotations);
}

/** The photo as stored: an empty caption is left out, as is a flattened copy without marks. */
export function savedPhoto(photo: {
  imageId: string;
  caption: string;
  annotations: Annotation[];
  renderedImageId: string | undefined;
}): AnnotatedImage {
  const caption = photo.caption.trim();
  return {
    imageId: photo.imageId,
    ...(caption && { caption }),
    annotations: photo.annotations,
    ...(photo.annotations.length > 0 && photo.renderedImageId
      ? { renderedImageId: photo.renderedImageId }
      : {}),
  };
}
