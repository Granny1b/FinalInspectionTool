/**
 * The printout as a Word document (brief §6, phase 5): the same structure as print, from the same
 * PrintModel — front page, one table per section, the deviations, the optional reference images
 * and the footer with "Page X of Y" — on A4 with the print margins. Word lays out its own pages,
 * so instead of print's measured pages the rules are Word's: header rows repeat, rows and cards
 * never split, headings keep with what follows. Pure (no browser), so it is tested in node.
 */
import {
  GUIDE_VERDICT_LABELS,
  SEVERITY_LABELS,
  STATUS_LABELS,
  STATUSES,
  type Status,
} from '@modig/shared';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeightRule,
  ImageRun,
  LeaderType,
  PageNumber,
  Paragraph,
  ShadingType,
  Tab,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TabStopType,
  TextRun,
  VerticalAlignTable,
  WidthType,
  type IBorderOptions,
  type IParagraphOptions,
  type IRunOptions,
  type ITableBordersOptions,
  type ITableCellOptions,
} from 'docx';
import {
  APPENDIX_TITLE,
  captionLabel,
  VERDICT_SYMBOLS,
  type AppendixEntry,
  type AppendixImage,
} from '../print/appendix';
import type {
  DeviationCard,
  FrontPage,
  PrintMode,
  PrintModel,
  PrintRow,
  PrintSection,
} from '../print/model';
import { fitWithin, type Box, type WordImage } from './images';

/** The images the document embeds: photos by image id (missing: couldn't be loaded) and the logo. */
export type WordImages = { photos: ReadonlyMap<string, WordImage>; logo: WordImage | null };

// --- Units and look ----------------------------------------------------------------------------

/** Word measures in twips (1/20 pt); the layout is in mm like print.css. */
const twips = (mm: number) => Math.round((mm * 1440) / 25.4);
/** Image sizes are CSS pixels (96 to the inch). */
const pixels = (mm: number) => Math.round((mm * 96) / 25.4);
/** Font sizes are half points. */
const pt = (points: number) => points * 2;

/** A4 portrait with print.css's @page margins; the footer sits 7 mm above the bottom edge. */
const PAGE = { width: 210, height: 297, top: 14, right: 12, bottom: 16, left: 12, footer: 7 };
const CONTENT_WIDTH = PAGE.width - PAGE.left - PAGE.right;

/** On every computer with Word; LibreOffice maps it to the metric-compatible Liberation Sans. */
const FONT = 'Arial';
/** Arial has no ✓ ✗ ☐ ⓘ: the font Word itself uses for them. */
const SYMBOL_FONT = 'Segoe UI Symbol';

/** The greys of print.css: clean on a black-and-white laser printer. */
const INK = '000000';
const MUTED = '4D4D4D';
const RULE = '8C8C8C';
const FILL = 'E4E4E4';
const FILL_LIGHT = 'F3F3F3';

/** Border widths are eighths of a point: 0.25 mm ≈ 6, 0.4 mm ≈ 9. */
const rule = (size = 6, color = RULE, style: IBorderOptions['style'] = BorderStyle.SINGLE) => ({
  style,
  size,
  color,
});
const NONE: IBorderOptions = { style: BorderStyle.NONE, size: 0, color: 'auto' };
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE };
const NO_TABLE_BORDERS = { ...NO_BORDERS, insideHorizontal: NONE, insideVertical: NONE };

const FOOTER_STYLE = 'PageFooter';

/** ✓ ✗ – as on paper: a status never depends on colour. */
const STATUS_SYMBOLS: Record<Status, string> = { OK: '✓', NOK: '✗', NA: '–' };

/** No. | Checkpoint | Comment | OK | NOK | N/A | Resp, in mm as print.css has them. */
const CHECKLIST_COLUMNS = [10.5, 70, 47, 9.5, 9.5, 9.5, 30];
/** No. | Ref | Description | Severity | Resp | Closed (sign/date) */
const SUMMARY_COLUMNS = [13, 10.5, 87.5, 17, 30, 28];
/** Inside a deviation card's padding. */
const CARD_PADDING = 3;
const CARD_WIDTH = CONTENT_WIDTH - 2 * CARD_PADDING;

/** Blank rows leave room to write by hand (brief §6: at least 9 mm); report rows are lower. */
const ROW_HEIGHT: Record<PrintMode, number> = { blank: 9.5, report: 7 };

// --- The document ------------------------------------------------------------------------------

/** The Word document for a printout, with or without the reference images. */
export function wordDocument(
  model: PrintModel,
  { appendix, images }: { appendix: boolean; images: WordImages },
): Document {
  // Right of every heading, as on paper: the inspection number, or the checklist's name.
  const subject = model.front.number ?? model.checklistTitle;
  const children: (Paragraph | Table)[] = [
    ...frontPage(model.front, images),
    heading('Checklist', model.checklistTitle),
    ...(model.sections.length === 0
      ? [note('This checklist has no sections yet.')]
      : spaced(model.sections.map((section) => sectionTable(section, model.mode)))),
    heading('Deviation Summary', subject),
    ...(model.deviations.kind === 'lines'
      ? [
          note('Every NOK row and every finding that isn’t on the checklist, numbered in order.'),
          summaryTable(model.deviations.numbers),
        ]
      : model.deviations.cards.length === 0
        ? [note('No deviations recorded.')]
        : spaced(model.deviations.cards.map((card) => deviationCard(card, images.photos)))),
    ...(appendix && model.appendix.length > 0
      ? [
          heading(APPENDIX_TITLE, subject),
          ...model.appendix.flatMap((entry, index) => appendixEntry(entry, index, images.photos)),
        ]
      : []),
  ];

  return new Document({
    creator: model.front.companyName,
    title: model.fileName,
    styles: {
      default: {
        document: {
          run: { font: FONT, size: pt(9), color: INK },
          paragraph: { spacing: { before: 0, after: 0 } },
        },
      },
      // A style, not run formatting: the page numbers (field results) take their size from it.
      paragraphStyles: [
        { id: FOOTER_STYLE, name: 'Page footer', run: { size: pt(7.5), color: '3A3A3A' } },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: twips(PAGE.width), height: twips(PAGE.height) },
            margin: {
              top: twips(PAGE.top),
              right: twips(PAGE.right),
              bottom: twips(PAGE.bottom),
              left: twips(PAGE.left),
              header: twips(PAGE.top / 2),
              footer: twips(PAGE.footer),
            },
          },
        },
        footers: { default: pageFooter(model.footer) },
        children,
      },
    ],
  });
}

/** Bottom left the document, bottom right "Page X of Y" as Word fields (PAGE, NUMPAGES). */
function pageFooter(text: string): Footer {
  return new Footer({
    children: [
      new Paragraph({
        style: FOOTER_STYLE,
        tabStops: [{ type: TabStopType.RIGHT, position: twips(CONTENT_WIDTH) }],
        children: [
          run(text),
          new TextRun({
            children: [new Tab(), 'Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES],
          }),
        ],
      }),
    ],
  });
}

// --- Building blocks ---------------------------------------------------------------------------

type RunStyle = Omit<IRunOptions, 'text' | 'children'>;

function run(text: string, style: RunStyle = {}): TextRun {
  return new TextRun({ text, ...style });
}

function paragraph(
  children: IParagraphOptions['children'],
  options: Omit<IParagraphOptions, 'children'> = {},
): Paragraph {
  return new Paragraph({ children, ...options });
}

/** A part's heading (Checklist, Deviation Summary, Appendix) on a new page, the subject right. */
function heading(title: string, subject: string): Paragraph {
  return paragraph(
    [
      run(title, { bold: true, size: pt(13) }),
      new TextRun({ children: [new Tab(), subject], color: MUTED }),
    ],
    {
      pageBreakBefore: true,
      keepNext: true,
      tabStops: [{ type: TabStopType.RIGHT, position: twips(CONTENT_WIDTH) }],
      border: { bottom: { ...rule(9, INK), space: 2 } },
      spacing: { after: twips(4) },
    },
  );
}

function note(text: string): Paragraph {
  return paragraph([run(text, { color: MUTED, italics: true })], { spacing: { after: twips(3) } });
}

/**
 * Tables with a little space between them. Word merges tables that touch, so each needs a
 * paragraph between it and the next anyway.
 */
function spaced(tables: Table[]): (Paragraph | Table)[] {
  return tables.flatMap((table, index) =>
    index === 0 ? [table] : [paragraph([], { spacing: { after: twips(1.5) } }), table],
  );
}

/** A cell; Word needs a paragraph in every cell, so an empty one gets an empty paragraph. */
function cell(
  children: (Paragraph | Table)[],
  options: Omit<ITableCellOptions, 'children'> = {},
): TableCell {
  return new TableCell({ children: children.length > 0 ? children : [paragraph([])], ...options });
}

/**
 * A fixed-layout table with `columns` in mm (its width is their sum), thin grey rules unless
 * `borders` says otherwise, and `margins` mm of padding left and right in its cells.
 */
function table(
  rows: TableRow[],
  columns: number[],
  options: { borders?: ITableBordersOptions; margins?: number } = {},
): Table {
  const margin = twips(options.margins ?? 1.5);
  return new Table({
    rows,
    layout: TableLayoutType.FIXED,
    width: { size: twips(columns.reduce((sum, width) => sum + width, 0)), type: WidthType.DXA },
    columnWidths: columns.map(twips),
    borders: options.borders ?? {
      top: rule(),
      bottom: rule(),
      left: rule(),
      right: rule(),
      insideHorizontal: rule(),
      insideVertical: rule(),
    },
    margins: { top: twips(1.2), bottom: twips(1.2), left: margin, right: margin },
  });
}

/** An image scaled into `box` (mm), its proportions kept. */
function imageRun(image: WordImage, box: Box, alt: string): ImageRun {
  const size = fitWithin(image, box);
  return new ImageRun({
    type: image.type,
    data: image.data,
    transformation: { width: pixels(size.width), height: pixels(size.height) },
    altText: { name: alt, description: alt, title: alt },
  });
}

/** A centred photo, or a note in its place when it couldn't be loaded. */
function picture(image: WordImage | undefined, box: Box, alt: string): Paragraph {
  return paragraph(
    [
      image
        ? imageRun(image, box, alt)
        : run('The photo couldn’t be loaded.', { color: MUTED, size: pt(7.5) }),
    ],
    { alignment: AlignmentType.CENTER },
  );
}

// --- Front page --------------------------------------------------------------------------------

const SIGNATURES = ['Inspected by', 'Date', 'Signature'];

/** Page 1 (brief §6), as on paper: logo, title, company, report state, photo, data grid, signatures, Rev. */
function frontPage(front: FrontPage, images: WordImages): (Paragraph | Table)[] {
  const head = paragraph(
    [
      images.logo
        ? imageRun(images.logo, { width: 80, height: 14 }, front.companyName)
        : run(front.companyName, { bold: true, size: pt(14) }),
      ...(front.number
        ? [new TextRun({ children: [new Tab(), front.number], bold: true, size: pt(12) })]
        : []),
    ],
    {
      tabStops: [{ type: TabStopType.RIGHT, position: twips(CONTENT_WIDTH) }],
      border: { bottom: { ...rule(9, INK), space: 4 } },
      spacing: { after: twips(10) },
    },
  );
  return [
    head,
    paragraph([run('Final Inspection', { size: pt(28) })]),
    paragraph([run(front.companyName, { size: pt(12), color: MUTED })], {
      spacing: { before: twips(1.5) },
    }),
    ...(front.report
      ? [
          paragraph(
            [
              front.report.finalised
                ? run(front.report.text, { bold: true, size: pt(10) })
                : run(` ${front.report.text} `, {
                    bold: true,
                    size: pt(11),
                    border: rule(12, INK),
                  }),
            ],
            { spacing: { before: twips(6) } },
          ),
          paragraph([run(front.report.summary, { color: MUTED, size: pt(10) })], {
            spacing: { before: twips(1.5) },
          }),
        ]
      : []),
    ...machinePhoto(front, images),
    frontFields(front),
    signatures(),
    paragraph([run(front.revision)], {
      alignment: AlignmentType.RIGHT,
      spacing: { before: twips(7) },
    }),
  ];
}

function machinePhoto(front: FrontPage, images: WordImages): (Paragraph | Table)[] {
  const space = () => paragraph([], { spacing: { after: twips(4) } });
  const image = front.photoId ? images.photos.get(front.photoId) : undefined;
  if (image) {
    return [
      paragraph([imageRun(image, { width: CONTENT_WIDTH, height: 85 }, 'Machine photo')], {
        alignment: AlignmentType.CENTER,
        spacing: { before: twips(8), after: twips(8) },
      }),
    ];
  }
  // Without a photo its frame stays, like on paper.
  const label = front.photoId ? 'The machine photo couldn’t be loaded.' : 'No machine photo';
  return [space(), frame(label, { width: CONTENT_WIDTH, height: 60, centred: true }), space()];
}

/** A dashed frame, e.g. to sketch in; its label in the corner or in the middle. */
function frame(
  label: string,
  { width, height, centred = false }: Box & { centred?: boolean },
): Table {
  const dashed = rule(6, RULE, BorderStyle.DASHED);
  return table(
    [
      new TableRow({
        cantSplit: true,
        height: { value: twips(height), rule: HeightRule.EXACT },
        children: [
          cell(
            [
              paragraph([run(label, { size: pt(centred ? 9 : 7.5), color: MUTED })], {
                alignment: centred ? AlignmentType.CENTER : AlignmentType.LEFT,
              }),
            ],
            { verticalAlign: centred ? VerticalAlignTable.CENTER : VerticalAlignTable.TOP },
          ),
        ],
      }),
    ],
    [width],
    { borders: { top: dashed, bottom: dashed, left: dashed, right: dashed } },
  );
}

/** Label and value on a line each, the value low in the row: on the line, as on a paper form. */
function frontFields(front: FrontPage): Table {
  return table(
    front.fields.map(({ label, value }, index) => {
      // The rules are the cells' own: LibreOffice drops a table's when some sides are "none".
      const options = {
        verticalAlign: VerticalAlignTable.BOTTOM,
        borders: { ...NO_BORDERS, top: index === 0 ? rule() : NONE, bottom: rule() },
      };
      return new TableRow({
        cantSplit: true,
        height: { value: twips(10), rule: HeightRule.ATLEAST },
        children: [
          cell([paragraph([run(label, { bold: true, size: pt(8), color: MUTED })])], options),
          cell([paragraph([run(value, { size: pt(11) })])], options),
        ],
      });
    }),
    [36, CONTENT_WIDTH - 36],
    { borders: NO_TABLE_BORDERS, margins: 0 },
  );
}

/** Inspected by / Date / Signature: lines to sign on, with room above them. */
function signatures(): Table {
  const gap = 8;
  const widths = [5, 3, 5].map((share) => ((CONTENT_WIDTH - 2 * gap) * share) / 13);
  const columns = [widths[0]!, gap, widths[1]!, gap, widths[2]!];
  const line = (label: string) =>
    cell([paragraph([run(label, { size: pt(8), color: MUTED })])], {
      borders: { ...NO_BORDERS, top: rule(7, INK) },
    });
  const spacer = () => cell([], { borders: NO_BORDERS });
  return table(
    [
      new TableRow({
        height: { value: twips(15), rule: HeightRule.EXACT },
        children: columns.map(() => spacer()),
      }),
      new TableRow({
        children: SIGNATURES.flatMap((label, index) =>
          index === 0 ? [line(label)] : [spacer(), line(label)],
        ),
      }),
    ],
    columns,
    { borders: NO_TABLE_BORDERS, margins: 0 },
  );
}

// --- Checklist ---------------------------------------------------------------------------------

/**
 * One section: its title and the column labels repeat on every page it runs onto; no row is
 * split; the heading keeps with the first row, the first row with the second and the last with
 * the one before, like on paper.
 */
function sectionTable(section: PrintSection, mode: PrintMode): Table {
  const keep = { keepNext: true };
  const header = [
    new TableRow({
      tableHeader: true,
      cantSplit: true,
      children: [
        cell(
          [
            paragraph(
              [
                run(String(section.number), { bold: true, size: pt(10) }),
                new TextRun({ children: [new Tab(), section.title], bold: true, size: pt(10) }),
              ],
              // The title sits over the checkpoints, the number over the refs.
              { ...keep, tabStops: [{ type: TabStopType.LEFT, position: twips(10.5) }] },
            ),
          ],
          {
            columnSpan: CHECKLIST_COLUMNS.length,
            shading: { type: ShadingType.CLEAR, fill: FILL, color: 'auto' },
            borders: {
              top: rule(6, INK),
              bottom: rule(6, INK),
              left: rule(6, INK),
              right: rule(6, INK),
            },
          },
        ),
      ],
    }),
    new TableRow({
      tableHeader: true,
      cantSplit: true,
      children: [
        'No.',
        'Checkpoint',
        'Comment',
        ...STATUSES.map((s) => STATUS_LABELS[s]),
        'Resp',
      ].map((label, index) =>
        cell(
          [
            paragraph([run(label, { bold: true, size: pt(7) })], {
              ...keep,
              alignment: index >= 3 && index <= 5 ? AlignmentType.CENTER : AlignmentType.LEFT,
            }),
          ],
          { shading: { type: ShadingType.CLEAR, fill: FILL_LIGHT, color: 'auto' } },
        ),
      ),
    }),
  ];
  const rows =
    section.rows.length === 0
      ? [
          new TableRow({
            children: [
              cell(
                [
                  paragraph([
                    run('No checkpoints in this section.', { italics: true, color: MUTED }),
                  ]),
                ],
                {
                  columnSpan: CHECKLIST_COLUMNS.length,
                },
              ),
            ],
          }),
        ]
      : section.rows.map((row, index) =>
          checklistRow(row, mode, index === 0 || index === section.rows.length - 2),
        );
  return table([...header, ...rows], CHECKLIST_COLUMNS);
}

function checklistRow(row: PrintRow, mode: PrintMode, keepNext: boolean): TableRow {
  const text = (value: string, style: RunStyle = {}) =>
    paragraph([run(value, style)], { keepNext });
  // Blank rows are written in by hand: their text sits in the middle, like on paper.
  const verticalAlign = mode === 'blank' ? VerticalAlignTable.CENTER : VerticalAlignTable.TOP;
  const marks = { verticalAlign: VerticalAlignTable.CENTER };
  return new TableRow({
    cantSplit: true,
    height: { value: twips(ROW_HEIGHT[mode]), rule: HeightRule.ATLEAST },
    children: [
      cell([text(row.ref, { bold: true })], { verticalAlign }),
      cell([text(row.text)], { verticalAlign }),
      cell(
        [
          ...(row.severity
            ? [text(`Severity: ${SEVERITY_LABELS[row.severity]}`, { bold: true })]
            : []),
          ...(row.comment ? [text(row.comment)] : []),
        ],
        { verticalAlign },
      ),
      ...STATUSES.map((status) => cell(statusMark(row, status, keepNext), marks)),
      cell([text(row.resp)], { verticalAlign }),
    ],
  });
}

/** An empty box to tick while nothing is recorded; in the recorded status's column ✓ ✗ – over its name. */
function statusMark(row: PrintRow, status: Status, keepNext: boolean): Paragraph[] {
  const centred = { alignment: AlignmentType.CENTER, keepNext };
  if (row.status === null) {
    return [paragraph([run('☐', { font: SYMBOL_FONT, size: pt(12) })], centred)];
  }
  if (row.status !== status) return [];
  return [
    paragraph(
      [
        run(STATUS_SYMBOLS[status], {
          bold: true,
          size: pt(10),
          font: status === 'NA' ? FONT : SYMBOL_FONT,
        }),
      ],
      centred,
    ),
    paragraph([run(STATUS_LABELS[status], { bold: true, size: pt(6.5) })], centred),
  ];
}

/** The blank Deviation Summary: numbered lines to fill in by hand on the walk-round. */
function summaryTable(numbers: string[]): Table {
  const labels = ['No.', 'Ref', 'Description', 'Severity', 'Resp', 'Closed (sign/date)'];
  return table(
    [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: labels.map((label) =>
          cell([paragraph([run(label, { bold: true, size: pt(7) })])], {
            shading: { type: ShadingType.CLEAR, fill: FILL_LIGHT, color: 'auto' },
          }),
        ),
      }),
      ...numbers.map(
        (number) =>
          new TableRow({
            cantSplit: true,
            height: { value: twips(ROW_HEIGHT.blank), rule: HeightRule.ATLEAST },
            children: labels.map((_, index) =>
              cell(index === 0 ? [paragraph([run(number, { bold: true })])] : [], {
                verticalAlign: VerticalAlignTable.CENTER,
              }),
            ),
          }),
      ),
    ],
    SUMMARY_COLUMNS,
  );
}

// --- Deviation cards ---------------------------------------------------------------------------

/**
 * A report's deviation as a framed card: "D-03 · 4.c · Major", the section, checkpoint or
 * description, comment, Resp, up to two photos as marked up, and a line to sign it off. One table
 * row that can't split, so a card is never split across pages.
 */
function deviationCard(card: DeviationCard, photos: ReadonlyMap<string, WordImage>): Table {
  const head = [card.number, ...(card.ref ? [card.ref] : []), SEVERITY_LABELS[card.severity]];
  const label = (text: string) => run(`${text}  `, { bold: true, size: pt(7.5), color: MUTED });
  const content = [
    paragraph([run(head.join(' · '), { bold: true, size: pt(11) })]),
    paragraph(
      [run(card.ref ? card.sectionTitle : 'Not on the checklist', { size: pt(7.5), color: MUTED })],
      {
        spacing: { before: twips(1.2) },
      },
    ),
    paragraph([run(card.text, { bold: true, size: pt(9.5) })], { spacing: { before: twips(0.6) } }),
    ...(card.comment ? [paragraph([run(card.comment)], { spacing: { before: twips(1) } })] : []),
    paragraph([label('Resp'), run(card.resp || '—')], {
      spacing: { before: twips(1.5), after: twips(2.5) },
    }),
    cardPhotos(card, photos),
    paragraph(
      [
        label('Closed'),
        run('Sign ', { size: pt(7.5), color: MUTED }),
        new TextRun({ children: [new Tab()], size: pt(7.5) }),
        run('   Date ', { size: pt(7.5), color: MUTED }),
        new TextRun({ children: [new Tab()], size: pt(7.5) }),
      ],
      {
        spacing: { before: twips(3) },
        tabStops: [
          {
            type: TabStopType.LEFT,
            position: twips(CARD_WIDTH * 0.6),
            leader: LeaderType.UNDERSCORE,
          },
          { type: TabStopType.RIGHT, position: twips(CARD_WIDTH), leader: LeaderType.UNDERSCORE },
        ],
      },
    ),
  ];
  return table([new TableRow({ cantSplit: true, children: [cell(content)] })], [CONTENT_WIDTH], {
    borders: { top: rule(7), bottom: rule(7), left: rule(7), right: rule(7) },
    margins: CARD_PADDING,
  });
}

/** One photo large, two side by side, each with its caption; none: a frame to sketch in. */
function cardPhotos(card: DeviationCard, photos: ReadonlyMap<string, WordImage>): Table {
  // Room to sketch or stick a photo on by hand.
  if (card.photos.length === 0) return frame('Sketch / photo', { width: CARD_WIDTH, height: 40 });
  const box = card.photos.length === 1 ? { width: 120, height: 80 } : { width: 85, height: 64 };
  const width = CARD_WIDTH / card.photos.length;
  return table(
    [
      new TableRow({
        cantSplit: true,
        children: card.photos.map((photo, index) =>
          cell([
            picture(photos.get(photo.imageId), box, `Photo ${index + 1} of ${card.number}`),
            ...(photo.caption
              ? [
                  paragraph([run(photo.caption, { size: pt(7.5), color: MUTED })], {
                    alignment: AlignmentType.CENTER,
                    spacing: { before: twips(1) },
                  }),
                ]
              : []),
          ]),
        ),
      }),
    ],
    card.photos.map(() => width),
    { borders: NO_TABLE_BORDERS },
  );
}

// --- Reference images --------------------------------------------------------------------------

/**
 * One row's guide images, two to a row, each captioned "3.c · ✓ Good" and its caption. The
 * heading and description keep with the first row of images; a row of images never splits.
 */
function appendixEntry(
  entry: AppendixEntry,
  index: number,
  photos: ReadonlyMap<string, WordImage>,
): (Paragraph | Table)[] {
  const half = CONTENT_WIDTH / 2;
  return [
    paragraph(
      [
        run(entry.ref, { bold: true, size: pt(10) }),
        new TextRun({ children: [new Tab(), entry.text], bold: true, size: pt(10) }),
      ],
      {
        keepNext: true,
        tabStops: [{ type: TabStopType.LEFT, position: twips(10.5) }],
        indent: { left: twips(10.5), hanging: twips(10.5) },
        spacing: { before: twips(index === 0 ? 0 : 6), after: twips(1) },
        ...(index === 0 ? {} : { border: { top: { ...rule(), space: 6 } } }),
      },
    ),
    ...(entry.description
      ? [paragraph([run(entry.description)], { keepNext: true, spacing: { after: twips(1) } })]
      : []),
    table(
      entry.rows.map(
        (images) =>
          new TableRow({
            cantSplit: true,
            children: [0, 1].map((slot) => {
              const image = images[slot];
              return cell(image ? guideImage(image, photos) : []);
            }),
          }),
      ),
      [half, half],
      { borders: NO_TABLE_BORDERS, margins: 1.5 },
    ),
  ];
}

function guideImage(image: AppendixImage, photos: ReadonlyMap<string, WordImage>): Paragraph[] {
  const bold = { bold: true, size: pt(8) };
  return [
    picture(
      photos.get(image.imageId),
      { width: CONTENT_WIDTH / 2 - 3, height: 66 },
      captionLabel(image),
    ),
    paragraph(
      [
        run(`${image.ref} · `, bold),
        run(VERDICT_SYMBOLS[image.verdict], { ...bold, font: SYMBOL_FONT }),
        run(` ${GUIDE_VERDICT_LABELS[image.verdict]}`, bold),
        ...(image.caption ? [run(image.caption, { size: pt(8), color: MUTED, break: 1 })] : []),
      ],
      { spacing: { before: twips(1.2), after: twips(3) } },
    ),
  ];
}
