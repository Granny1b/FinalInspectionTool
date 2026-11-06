/**
 * The two documents the print machinery lays out (the print route, the preview dialog, the
 * images, the card pages and readiness): a final inspection's or template's checklist
 * (`PrintModel`), and a quality check's report (`QualityPrintModel`).
 */
import { printedImageIds, type PrintModel } from './model';
import { qualityImageIds, type QualityPrintModel } from './quality/model';

export type Printout = PrintModel | QualityPrintModel;

/**
 * Every uploaded image the document shows (the logo aside), each once; a checklist's appendix
 * images only when it is printed. A quality check's report has no appendix.
 */
export function printoutImageIds(model: Printout, { appendix }: { appendix: boolean }): string[] {
  return model.document === 'quality'
    ? qualityImageIds(model)
    : printedImageIds(model, { appendix });
}

/** The reference images' entries a checklist can add; a quality check's report has none. */
export function appendixCount(model: Printout): number {
  return model.document === 'quality' ? 0 : model.appendix.length;
}
