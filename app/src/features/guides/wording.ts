/**
 * How the guide dialogs talk about a row's guide. A final inspection row has a guide with
 * reference images marked Good, Bad or Info; a quality check's row has pictures of how it should
 * and should not look, and "More information". The stored guide is the same.
 */
import { GUIDE_VERDICT_LABELS, QUALITY_VERDICT_LABELS, type GuideVerdict } from '@modig/shared';

export type GuideWording = {
  /** Before the row in the dialogs' titles: "Guide · 3.c …". */
  title: string;
  /** Under the editor's title. */
  intro: string;
  descriptionLabel: string;
  descriptionPlaceholder: string;
  imagesHeading: string;
  /** Under the images' heading in the editor. */
  imagesHint: string;
  /** The images' word in the photo list ("Add image"). */
  noun: 'image' | 'picture';
  /** The list of images, for screen readers. */
  listLabel: (rowRef: string) => string;
  verdicts: Record<GuideVerdict, string>;
  /** The verdicts one under another, for labels too long to share a line. */
  stackVerdicts: boolean;
  removeLabel: string;
  removeTitle: (rowRef: string) => string;
  removeMessage: string;
  /** The viewer's message when there is nothing in it. */
  empty: string;
};

export const FINAL_GUIDE_WORDING: GuideWording = {
  title: 'Guide',
  intro:
    'What this checkpoint should and shouldn’t look like. Inspectors open it from the row’s guide icon.',
  descriptionLabel: 'Description',
  descriptionPlaceholder:
    'What good looks like, e.g. “Every screw has an unbroken paint mark from head to plate.”',
  imagesHeading: 'Reference images',
  imagesHint:
    'Mark each one Good, Bad or Info. Click an image to draw arrows, boxes and labels on it; drag its ⠿ to change the order. Paste or drop an image anywhere here to add it.',
  noun: 'image',
  listLabel: (rowRef) => `Images of the guide for ${rowRef}`,
  verdicts: GUIDE_VERDICT_LABELS,
  stackVerdicts: false,
  removeLabel: 'Remove guide',
  removeTitle: (rowRef) => `Remove the guide of row ${rowRef}?`,
  removeMessage:
    'Its description and images are removed from the draft. Published revisions and the inspections made from them keep theirs.',
  empty: 'This guide is empty.',
};

export const QUALITY_GUIDE_WORDING: GuideWording = {
  title: 'Pictures',
  intro: 'How this checkpoint should and should not look, and anything else worth knowing.',
  descriptionLabel: 'More information',
  descriptionPlaceholder: 'Where to find it, tolerances, what to do if it is wrong…',
  imagesHeading: 'Pictures',
  imagesHint:
    'Mark each one Should look like this, Should not look like this or Info. Click a picture to draw arrows, boxes and labels on it; drag its ⠿ to change the order. Paste or drop a picture anywhere here to add it.',
  noun: 'picture',
  listLabel: (rowRef) => `Pictures of row ${rowRef}`,
  verdicts: QUALITY_VERDICT_LABELS,
  stackVerdicts: true,
  removeLabel: 'Remove pictures and information',
  removeTitle: (rowRef) => `Remove the pictures and information of row ${rowRef}?`,
  removeMessage: 'They are removed from the draft. Published revisions keep theirs.',
  empty: 'No pictures or information yet.',
};
