import { SEVERITY_LABELS } from '@modig/shared';
import { useId, type ReactNode } from 'react';
import {
  isOversizedPage,
  type DeviationCard as DeviationCardModel,
  type DeviationPhoto,
  type DeviationsPerPage,
} from './model';
import { PaperPhoto } from './PaperPhoto';
import type { CardPages } from './useCardPages';

/**
 * How a card is signed off by hand: `closed`, a final report's "Closed · Sign · Date" line;
 * `action`, a quality check's "Action taken" lines over "Closed on" and "Signature", for the
 * printout kept at the machine.
 */
export type SignOff = 'closed' | 'action';

type Props = {
  cards: DeviationCardModel[];
  /** The cards on pages, once measured, and the hidden page they are measured on. */
  cardPages: CardPages;
  perPage: DeviationsPerPage;
  /** Right of each page's heading: the inspection number. */
  subject: string;
  /** Read URLs by image id; a photo without one prints as "couldn't be loaded". */
  imageUrls: ReadonlyMap<string, string>;
  /** Each page's heading. */
  title?: string;
  signOff?: SignOff;
  /** Above the first page's heading (and above "No deviations recorded."): a short header. */
  lead?: ReactNode;
  /** After the last card: a sign-off for all of them, under it or on a page of its own. */
  closing?: ReactNode;
};

/**
 * A report's deviations: one card each, up to `perPage` cards to a page, each page a sheet of its
 * own so no card is ever split. Cards share their page equally; one whose text needs more takes
 * it from the others, and the page holds fewer cards when not all of them fit (useCardPages).
 * Every slot has the same size, also on a page with fewer cards; only a card too tall to share a
 * page has its page to itself, full width.
 *
 * A quality check's cards add a lead (its short header, when only the deviations print), a
 * closing sign-off after the last card, and room on each card to sign it off at the machine.
 */
export function DeviationCards({
  cards,
  cardPages,
  perPage,
  subject,
  imageUrls,
  title = 'Deviation Summary',
  signOff = 'closed',
  lead,
  closing,
}: Props) {
  const titleId = useId();
  const { pages, heights, room, first, closingAlone, measureRef } = cardPages;
  const card = (model: DeviationCardModel, wide = false) => (
    <DeviationCard
      key={model.number}
      card={model}
      wide={wide}
      signOff={signOff}
      imageUrls={imageUrls}
    />
  );
  // Marked, so useCardPages measures them with the cards.
  const leadBlock = lead && <div data-card-lead="">{lead}</div>;
  const closingBlock = closing && <div data-card-closing="">{closing}</div>;

  return (
    <section
      className="paper-deviations"
      aria-labelledby={titleId}
      data-deviations-per-page={perPage}
      data-sign-off={signOff}
    >
      {cards.length === 0 ? (
        <div className="paper-sheet">
          {leadBlock}
          <Heading titleId={titleId} title={title} subject={subject} />
          <p className="paper-empty">No deviations recorded.</p>
        </div>
      ) : pages === null ? (
        // Laid out once, hidden, to be measured: each card at its natural height.
        <div className="paper-sheet paper-measure" aria-hidden="true">
          <div ref={measureRef} className="paper-card-page">
            {leadBlock}
            <Heading title={title} subject={subject} />
            <div className="paper-cards" data-card-list="">
              {cards.map((model) => card(model))}
            </div>
            {closingBlock}
          </div>
        </div>
      ) : (
        <>
          {pages.map((page, index) => {
            // The first page's room is less what the lead takes of it.
            const oversized = isOversizedPage(page, heights, index === 0 ? room - first : room);
            const last = index === pages.length - 1;
            return (
              <div key={page[0]!.number} className="paper-sheet">
                <div className="paper-card-page">
                  {index === 0 && leadBlock}
                  <Heading
                    // Repeated on every page for the reader of the paper; once for a screen reader.
                    titleId={index === 0 ? titleId : undefined}
                    title={title}
                    subject={`${subject} · ${range(page)}`}
                  />
                  <div className="paper-cards">
                    {page.map((model) => card(model, oversized))}
                    {last && !closingAlone && closingBlock}
                    {/* A page with fewer cards keeps their size. */}
                    {!oversized &&
                      Array.from({ length: perPage - page.length }, (_, slot) => (
                        <div key={slot} aria-hidden="true" />
                      ))}
                  </div>
                </div>
              </div>
            );
          })}
          {closingAlone && closingBlock && (
            <div className="paper-sheet">
              <div className="paper-card-page">
                <Heading title={title} subject={subject} />
                {closingBlock}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Heading({
  titleId,
  title,
  subject,
}: {
  titleId?: string;
  title: string;
  subject: string;
}) {
  return (
    <div className="paper-heading" aria-hidden={titleId ? undefined : true}>
      <h2 id={titleId}>{title}</h2>
      <p>{subject}</p>
    </div>
  );
}

/** "D-01–D-04", or "D-05" for a page with one card. */
function range(page: DeviationCardModel[]): string {
  const first = page[0]!.number;
  const last = page[page.length - 1]!.number;
  return first === last ? first : `${first}–${last}`;
}

function DeviationCard({
  card,
  wide,
  signOff,
  imageUrls,
}: {
  card: DeviationCardModel;
  /** Alone on its page: full width in either layout (print.css). */
  wide: boolean;
  signOff: SignOff;
  imageUrls: ReadonlyMap<string, string>;
}) {
  const titleId = useId();
  return (
    <article
      className="paper-card"
      data-deviation-card={card.number}
      data-wide={wide || undefined}
      aria-labelledby={titleId}
    >
      <div className="paper-card-body">
        {/* "D-03 · 4.c · Major": the severity in words, never by colour alone. */}
        <h3 id={titleId} className="paper-card-head">
          <span className="paper-card-number">{card.number}</span>
          {card.ref && (
            <>
              <span className="paper-card-dot" aria-hidden="true">
                ·
              </span>
              <span className="paper-card-ref">{card.ref}</span>
            </>
          )}
          <span className="paper-card-severity" data-severity={card.severity}>
            {SEVERITY_LABELS[card.severity]}
          </span>
        </h3>
        <p className="paper-card-section">
          {card.ref ? card.sectionTitle : 'Not on the checklist'}
        </p>
        <p className="paper-card-text">{card.text}</p>
        {card.comment && <p className="paper-card-comment">{card.comment}</p>}
        <p className="paper-card-resp">
          <span className="paper-card-label">Category</span>
          {card.category || '—'}
        </p>
        {/* In full: a card has the room the checklist's narrow Resp column lacks, and a customer
            reads it. */}
        <p className="paper-card-resp">
          <span className="paper-card-label">Responsible</span>
          {card.resp || '—'}
        </p>
      </div>

      <div className="paper-card-photos">
        {card.photos.length === 0 ? (
          // Room to sketch or stick a photo on by hand.
          <div className="paper-card-frame paper-card-sketch">Sketch / photo</div>
        ) : (
          card.photos.map((photo, index) => (
            <CardPhoto
              key={index}
              photo={photo}
              url={imageUrls.get(photo.imageId) ?? null}
              alt={`Photo ${index + 1} of ${card.number}`}
            />
          ))
        )}
      </div>

      {signOff === 'action' ? (
        <ActionTaken />
      ) : (
        <div className="paper-card-closed">
          <span className="paper-card-label">Closed</span>
          <span>Sign</span>
          <span className="paper-card-line" />
          <span>Date</span>
          <span className="paper-card-line" />
        </div>
      )}
    </article>
  );
}

/**
 * Filled in by hand at the machine once the deviation is dealt with: what was done, on two lines,
 * then when it was closed and by whom. Lines high enough to write on (print.css).
 */
function ActionTaken() {
  return (
    <div className="paper-card-closed paper-card-action">
      <span className="paper-card-label">Action taken</span>
      <span className="paper-card-line" />
      <span className="paper-card-line paper-card-action-more" />
      <div className="paper-card-action-signed">
        <span className="paper-card-label">Closed on</span>
        <span className="paper-card-line" />
        <span className="paper-card-label">Signature</span>
        <span className="paper-card-line" />
      </div>
    </div>
  );
}

function CardPhoto({
  photo,
  url,
  alt,
}: {
  photo: DeviationPhoto;
  url: string | null;
  alt: string;
}) {
  return (
    <figure className="paper-card-photo">
      <div className="paper-card-image">
        <PaperPhoto
          url={url}
          alt={alt}
          missing={<div className="paper-card-frame">The photo couldn’t be loaded.</div>}
        />
      </div>
      {photo.caption && <figcaption>{photo.caption}</figcaption>}
    </figure>
  );
}
