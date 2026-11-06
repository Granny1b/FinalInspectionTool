/**
 * The documents the print machinery lays out (the print route, the preview dialog, the images,
 * the card pages and readiness): a final inspection's or template's checklist (`PrintModel`), a
 * quality check's report (`QualityPrintModel`) and a quality check's instructions, printed from
 * its template (`InstructionsModel`).
 */
import { printedImageIds, type PrintModel } from './model';
import { instructionImageIds, type InstructionsModel } from './quality/instructions';
import { qualityImageIds, type QualityPrintModel } from './quality/model';

export type Printout = PrintModel | QualityPrintModel | InstructionsModel;

/**
 * Every uploaded image the document shows (the logo aside), each once; a checklist's appendix
 * images only when it is printed. A quality check's report has no appendix.
 */
export function printoutImageIds(model: Printout, { appendix }: { appendix: boolean }): string[] {
  switch (model.document) {
    case 'quality':
      return qualityImageIds(model);
    case 'instructions':
      // Their pictures are the document itself, not an appendix.
      return instructionImageIds(model);
    default:
      return printedImageIds(model, { appendix });
  }
}

/** The reference images' entries a checklist can add; a quality check's documents have none. */
export function appendixCount(model: Printout): number {
  return model.document === 'checklist' ? model.appendix.length : 0;
}
