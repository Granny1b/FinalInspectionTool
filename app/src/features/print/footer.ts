/**
 * The page footer as an `@page` rule with two margin boxes (brief §6): the document on the left,
 * "Page X of Y" on the right. Chromium draws margin boxes in print and "Save as PDF".
 *
 * Both boxes must be in this one rule: a later `@page` rule that defines margin boxes drops the
 * ones of earlier rules. Margin boxes inherit nothing from the page, so the font is set here.
 */
const BOX_STYLE = `font-family: 'Inter Variable', ui-sans-serif, system-ui, sans-serif; font-size: 7.5pt; color: #3a3a3a;`;

export function pageFooterRule(left: string): string {
  return (
    `@page { ` +
    `@bottom-left { content: ${cssString(left)}; ${BOX_STYLE} } ` +
    // The inset keeps the page number inside the margin: Chrome's PDFs place the right content
    // edge about 0.3 mm further out (see --paper-edge-inset in print.css).
    `@bottom-right { content: "Page " counter(page) " of " counter(pages); ${BOX_STYLE} text-align: right; padding-right: 0.5mm; white-space: nowrap; } ` +
    `}`
  );
}

/**
 * A CSS string literal for any text. JSON.stringify escapes `"` and `\` the way CSS reads them;
 * the rest of its escapes (`\n`, `\u0001`) mean something else in CSS, so line breaks and control
 * characters become spaces first, and lone surrogates (broken text) the replacement character.
 */
export function cssString(text: string): string {
  const clean = text
    // eslint-disable-next-line no-control-regex -- control characters are exactly what is removed
    .replace(/[\u0000-\u001f\u007f\s]+/g, ' ')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '�')
    .trim();
  return JSON.stringify(clean);
}
