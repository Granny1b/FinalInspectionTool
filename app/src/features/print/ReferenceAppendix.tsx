import { GUIDE_VERDICT_LABELS } from '@modig/shared';
import { useId } from 'react';
// ✓ ✗ ⓘ as on screen, drawn like the checklist's status marks: Inter has no such glyphs.
import { VERDICT_ICONS } from '../guides/verdicts';
import { APPENDIX_TITLE, captionLabel, type AppendixEntry, type AppendixImage } from './appendix';
import { PaperPhoto } from './PaperPhoto';

type Props = {
  entries: AppendixEntry[];
  /** Right of the heading: the inspection number, or the checklist for a template preview. */
  subject: string;
  /** Read URLs by image id; an image without one prints as "couldn't be loaded". */
  imageUrls: ReadonlyMap<string, string>;
};

/**
 * "Include reference images" (brief §6), after the deviations on a page of its own: each row's
 * guide images, two to a row, captioned with the row's ref and the verdict. An image and its
 * caption are never split, and a row's heading always has its first images below it.
 */
export function ReferenceAppendix({ entries, subject, imageUrls }: Props) {
  const titleId = useId();
  return (
    <section className="paper-sheet" data-appendix="" aria-labelledby={titleId}>
      <div className="paper-heading">
        <h2 id={titleId}>{APPENDIX_TITLE}</h2>
        <p>{subject}</p>
      </div>
      {entries.map((entry) => (
        <Entry key={entry.ref} entry={entry} imageUrls={imageUrls} />
      ))}
    </section>
  );
}

function Entry({
  entry,
  imageUrls,
}: {
  entry: AppendixEntry;
  imageUrls: ReadonlyMap<string, string>;
}) {
  const headingId = useId();
  const [first = [], ...rest] = entry.rows;
  const row = (images: AppendixImage[], index: number) => (
    <div key={index} className="paper-guide-row">
      {images.map((image, slot) => (
        <GuideImage key={slot} image={image} url={imageUrls.get(image.imageId) ?? null} />
      ))}
    </div>
  );
  return (
    <section className="paper-guide" data-guide-ref={entry.ref} aria-labelledby={headingId}>
      {/* Kept together, so the heading never ends a page without images after it. */}
      <div className="paper-guide-start">
        <h3 id={headingId} className="paper-guide-heading">
          <span className="paper-ref">{entry.ref}</span>
          {entry.text}
        </h3>
        {entry.description && <p className="paper-guide-description">{entry.description}</p>}
        {row(first, 0)}
      </div>
      {rest.map((images, index) => row(images, index + 1))}
    </section>
  );
}

function GuideImage({ image, url }: { image: AppendixImage; url: string | null }) {
  const Icon = VERDICT_ICONS[image.verdict];
  return (
    <figure className="paper-guide-image" data-guide-image="" data-verdict={image.verdict}>
      <div className="paper-guide-photo">
        <PaperPhoto
          url={url}
          alt={captionLabel(image)}
          missing={<div className="paper-card-frame">The image couldn’t be loaded.</div>}
        />
      </div>
      <figcaption>
        {/* "3.c · ✓ Good": the verdict as a symbol and a word, never colour alone. */}
        <strong className="paper-guide-label">
          {image.ref} · <Icon className="paper-guide-icon" strokeWidth={3} aria-hidden="true" />
          {GUIDE_VERDICT_LABELS[image.verdict]}
        </strong>
        {image.caption && <span className="paper-guide-caption">{image.caption}</span>}
      </figcaption>
    </figure>
  );
}
