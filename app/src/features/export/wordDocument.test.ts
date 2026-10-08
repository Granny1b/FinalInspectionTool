import type { Inspection, Section, Template } from '@modig/shared';
import { Packer } from 'docx';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { inspectionPrint, templatePrint, type PrintModel } from '../print/model';
import { wordFileName } from './exportWord';
import type { WordImage } from './images';
import { wordDocument, type WordImages } from './wordDocument';

/**
 * Word documents built from print models, packed as Word would read them (`Packer.toBuffer`) and
 * unzipped: the XML says what Word will show.
 */

const CONTEXT = { companyName: 'Modig Machine Tool', modelLabel: 'RigiMill MG' };
const id = (prefix: string, n: number) => `${prefix}${String(n).padStart(16 - prefix.length, '0')}`;

/** Images only need a format and size to be embedded; Word gets these bytes as they are. */
const image = (n: number): WordImage => ({
  data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, n]),
  type: 'png',
  width: 1600,
  height: 1200,
});

const SECTIONS: Section[] = [
  {
    id: id('Sect', 1),
    title: 'Loading area',
    items: [
      { id: id('Item', 1), text: 'Lifting columns - Marked screws, blue/red/yellow' },
      {
        id: id('Item', 2),
        text: 'Pallet changer - Smooth movement',
        guide: {
          description: 'Rails clean, no chips.',
          images: [
            { imageId: id('Gui', 1), verdict: 'good', caption: 'Clean rail', annotations: [] },
            { imageId: id('Gui', 2), verdict: 'bad', annotations: [] },
            { imageId: id('Gui', 3), verdict: 'info', annotations: [] },
          ],
        },
      },
    ],
  },
  {
    id: id('Sect', 2),
    title: 'Tool arena',
    items: [{ id: id('Item', 3), text: 'Tool magazine - All pockets clean' }],
  },
];

const INSPECTION: Inspection = {
  id: id('Insp', 1),
  number: 'FI-2026-0042',
  templateId: id('Tmpl', 1),
  templateRevision: 2,
  templateSnapshot: {
    name: 'Final inspection – RigiMill MG',
    sections: SECTIONS,
    printSettings: { spareRowsPerSection: 3 },
  },
  front: {
    machineName: 'RigiMill MG – Volvo Skövde',
    modelCode: 'RMMG',
    serialNumber: 'RM-2026-031',
    participants: ['Erik Lund'],
    location: 'Kalmar, Sweden',
    date: '2026-10-07',
    photoId: id('Phot', 1),
  },
  results: {
    [id('Item', 1)]: {
      status: 'NOK',
      severity: 'major',
      comment: 'Two screws have no torque mark.',
      resp: 'Montage',
      photos: [
        {
          imageId: id('Orig', 1),
          renderedImageId: id('Rend', 1),
          caption: 'Left column',
          annotations: [],
        },
        { imageId: id('Orig', 2), annotations: [] },
      ],
    },
    [id('Item', 2)]: { status: 'OK' },
    [id('Item', 3)]: { status: 'NA', comment: 'Not ordered.' },
  },
  extraDeviations: [
    { id: id('Extr', 1), description: 'Operator manual missing', severity: 'minor' },
  ],
  state: 'finalised',
  finalisedAt: '2026-10-08T12:00:00.000Z',
  finalisedBy: 'erik.lund@modig.se',
  createdAt: '2026-10-07T08:00:00.000Z',
  createdBy: 'erik.lund@modig.se',
  updatedAt: '2026-10-08T12:00:00.000Z',
  updatedBy: 'erik.lund@modig.se',
};

const ALL_IMAGES: WordImages = {
  logo: image(0),
  photos: new Map(
    [id('Phot', 1), id('Rend', 1), id('Orig', 2), id('Gui', 1), id('Gui', 2), id('Gui', 3)].map(
      (imageId, index) => [imageId, image(index + 1)],
    ),
  ),
};

type Unzipped = {
  document: string;
  footer: string;
  media: string[];
  /** Every XML part of the file by name. */
  parts: Record<string, string>;
};

async function build(
  model: PrintModel,
  { appendix = false, images = ALL_IMAGES }: { appendix?: boolean; images?: WordImages } = {},
): Promise<Unzipped> {
  const zip = await JSZip.loadAsync(
    await Packer.toBuffer(wordDocument(model, { appendix, images })),
  );
  const read = (name: string) => zip.file(name)!.async('string');
  const footers = Object.keys(zip.files).filter((name) => /^word\/footer\d*\.xml$/.test(name));
  const xml = Object.keys(zip.files).filter((name) => /\.(xml|rels)$/.test(name));
  return {
    document: await read('word/document.xml'),
    footer: (await Promise.all(footers.map(read))).join(''),
    media: Object.keys(zip.files).filter((name) => name.startsWith('word/media/')),
    parts: Object.fromEntries(await Promise.all(xml.map(async (name) => [name, await read(name)]))),
  };
}

/** The checklist's rows (tables without nested ones), as XML. */
const tableRows = (xml: string) => xml.match(/<w:tr[ >](?:(?!<w:tbl>)[\s\S])*?<\/w:tr>/g) ?? [];

const count = (xml: string, pattern: RegExp) => xml.match(pattern)?.length ?? 0;
/** The text of the document in order, without the XML. */
const text = (xml: string) =>
  [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((match) => match[1]).join('');

describe('the Word export of a report', () => {
  const model = inspectionPrint(INSPECTION, 'report', CONTEXT);

  it('is A4 portrait with the print margins', async () => {
    const { document } = await build(model);
    expect(document).toMatch(/<w:pgSz w:w="11906" w:h="16838"/);
    // 14, 12, 16 and 12 mm in twips.
    expect(document).toMatch(
      /<w:pgMar [^>]*w:top="794"[^>]*w:right="680"[^>]*w:bottom="907"[^>]*w:left="680"/,
    );
  });

  it('has the front page with the data grid, signatures and revision', async () => {
    const all = text((await build(model)).document);
    for (const expected of [
      'FI-2026-0042',
      'Final Inspection',
      'Modig Machine Tool',
      'Machine name',
      'RigiMill MG – Volvo Skövde',
      'Serial number',
      'RM-2026-031',
      'Inspected by',
      'Signature',
      'Rev: 2',
      '3 / 3 rows filled · 1 NOK · 2 deviations',
    ]) {
      expect(all).toContain(expected);
    }
  });

  it('has one table per section whose two header rows repeat on every page', async () => {
    const { document } = await build(model);
    // Section title and column labels of 2 sections; the cards have no header rows.
    expect(count(document, /<w:tblHeader\/>/g)).toBe(4);
    const all = text(document);
    expect(all).toContain('Loading area');
    expect(all).toContain('No.CheckpointCommentOKNOKN/AResp');
    expect(all).toContain(
      '1.aLifting columns - Marked screws, blue/red/yellowSeverity: MajorTwo screws have no torque mark.',
    );
    // Statuses as symbol and word; no spare rows in a report.
    expect(all).toContain('✗NOK');
    expect(all).toContain('✓OK');
    expect(all).toContain('–N/A');
    expect(all).not.toContain('1.c');
    expect(all).not.toContain('☐');
  });

  it('never splits a row or a card across pages', async () => {
    const { document } = await build(model);
    const rows = count(document, /<w:tr[ >]/g);
    // Every row but the front page's spacer and signature rows.
    expect(count(document, /<w:cantSplit\/>/g)).toBeGreaterThanOrEqual(rows - 2);
  });

  it('prints a block per deviation with its photos, and the extra deviations', async () => {
    const { document } = await build(model);
    const all = text(document);
    expect(all).toContain('D-01 · 1.a · Major');
    expect(all).toContain('Lifting columns - Marked screws');
    expect(all).toContain('Left column');
    expect(all).toContain('D-02 · Minor');
    expect(all).toContain('Not on the checklist');
    expect(all).toContain('Operator manual missing');
    expect(all).toContain('Sketch / photo');
    expect(count(all, /Closed {2}Sign/g)).toBe(2);
  });

  it('embeds the logo, the machine photo and the deviation photos', async () => {
    const { document, media } = await build(model);
    // Logo, machine photo, two photos on D-01.
    expect(count(document, /<a:blip /g)).toBe(4);
    expect(media.length).toBeGreaterThanOrEqual(1);
  });

  it('says where a photo couldn’t be loaded', async () => {
    const { document } = await build(model, {
      appendix: true,
      images: { logo: null, photos: new Map() },
    });
    expect(count(document, /<a:blip /g)).toBe(0);
    const all = text(document);
    expect(all).toContain('The machine photo couldn’t be loaded.');
    expect(count(all, /The photo couldn’t be loaded\./g)).toBe(2);
    // A reference image keeps its frame, as on paper.
    expect(count(all, /The image couldn’t be loaded\./g)).toBe(3);
  });

  it('has the footer of the printout and "Page X of Y" as Word fields', async () => {
    const { footer } = await build(model);
    expect(text(footer)).toContain(
      'Modig Machine Tool · FI-2026-0042 · RigiMill MG – Volvo Skövde · S/N RM-2026-031 · Rev 2',
    );
    expect(footer).toMatch(/<w:instrText[^>]*>\s*PAGE\s*<\/w:instrText>/);
    expect(footer).toMatch(/<w:instrText[^>]*>\s*NUMPAGES\s*<\/w:instrText>/);
  });

  it('adds the reference images only when asked, two to a row with ref and verdict', async () => {
    expect(text((await build(model)).document)).not.toContain('Appendix');
    const { document } = await build(model, { appendix: true });
    const all = text(document);
    expect(all).toContain('Appendix · Reference images');
    expect(all).toContain('1.bPallet changer - Smooth movement');
    expect(all).toContain('Rails clean, no chips.');
    expect(all).toContain('1.b · ✓ GoodClean rail');
    expect(all).toContain('1.b · ✗ Bad');
    expect(all).toContain('1.b · ⓘ Info');
    // Logo, machine photo, two deviation photos and three reference images.
    expect(count(document, /<a:blip /g)).toBe(7);
  });
});

describe('the Word export of awkward text', () => {
  it('leaves out the control characters XML refuses, so the file always opens', async () => {
    // U+000B is the line break Word's own paste leaves in a text; U+0001 any stray control.
    const inspection: Inspection = {
      ...INSPECTION,
      templateSnapshot: {
        ...INSPECTION.templateSnapshot,
        sections: [
          {
            ...SECTIONS[0]!,
            title: 'Loading\u0001area',
            items: SECTIONS[0]!.items.map((item) =>
              item.guide
                ? { ...item, guide: { ...item.guide, description: 'Rails\u000Bclean' } }
                : item,
            ),
          },
          SECTIONS[1]!,
        ],
      },
      front: { ...INSPECTION.front, machineName: 'RigiMill\u000BMG' },
      results: {
        ...INSPECTION.results,
        [id('Item', 1)]: {
          ...INSPECTION.results[id('Item', 1)]!,
          comment: 'Bolt loose\u000Bsee photo',
          photos: [{ imageId: id('Orig', 2), caption: 'Left\u000Bcolumn', annotations: [] }],
        },
      },
    };
    const model = inspectionPrint(inspection, 'report', {
      ...CONTEXT,
      companyName: 'Modig\u0001Machine Tool',
    });
    const { document, parts } = await build(model, { appendix: true });
    for (const [name, xml] of Object.entries(parts)) {
      // eslint-disable-next-line no-control-regex -- the characters XML 1.0 refuses
      expect(xml, name).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/);
    }
    const all = text(document);
    expect(all).toContain('Bolt loose see photo');
    expect(all).toContain('RigiMill MG');
    expect(all).toContain('Loadingarea');
    expect(all).toContain('Left column');
    expect(all).toContain('Rails clean');
  });

  it('keeps the line breaks of a guide’s description', async () => {
    const sections: Section[] = [
      {
        ...SECTIONS[0]!,
        items: SECTIONS[0]!.items.map((item) =>
          item.guide
            ? { ...item, guide: { ...item.guide, description: 'Check:\n1. Rails\r\n2. Chips' } }
            : item,
        ),
      },
    ];
    const inspection = {
      ...INSPECTION,
      templateSnapshot: { ...INSPECTION.templateSnapshot, sections },
    };
    const { document } = await build(inspectionPrint(inspection, 'report', CONTEXT), {
      appendix: true,
    });
    expect(document).toMatch(
      /Check:<\/w:t><\/w:r><w:r><w:br\/><w:t[^>]*>1\. Rails<\/w:t><\/w:r><w:r><w:br\/><w:t[^>]*>2\. Chips</,
    );
    expect(document).not.toMatch(/<w:t[^>]*>[^<]*[\r\n][^<]*<\/w:t>/);
  });

  it('lets a row or card taller than a page split, instead of Word cutting it off', async () => {
    const long = 'Long comment about the deviation, with details. '.repeat(41).slice(0, 2000);
    const inspection: Inspection = {
      ...INSPECTION,
      results: {
        ...INSPECTION.results,
        [id('Item', 1)]: { ...INSPECTION.results[id('Item', 1)]!, comment: long },
      },
      extraDeviations: [
        {
          id: id('Extr', 1),
          description: 'D'.repeat(2000),
          comment: long,
          severity: 'critical',
        },
      ],
    };
    const { document } = await build(inspectionPrint(inspection, 'report', CONTEXT));
    const rows = tableRows(document);
    const tall = rows.filter((row) => row.includes('Long comment about'));
    // The checklist row (the cards hold nested tables and are not among these).
    expect(tall).toHaveLength(1);
    expect(tall[0]).not.toContain('<w:cantSplit/>');
    expect(tall[0]).not.toContain('<w:keepNext/>');
    // The section's next row is short: it still never splits and keeps with the last.
    const next = rows.find((row) => row.includes('>1.b<'));
    expect(next).toContain('<w:cantSplit/>');
    // The extra deviation's card (one outer row) may split; the first card may not.
    const cardStart = (number: string) => {
      const at = document.indexOf(`>${number} · `);
      return document.slice(document.lastIndexOf('<w:tbl>', at), at);
    };
    expect(cardStart('D-01')).toContain('<w:cantSplit/>');
    expect(cardStart('D-02')).not.toContain('<w:cantSplit/>');
    expect(text(document)).toContain('D-02 · Critical');
  });

  it('gives the photo less room when the front page’s values run over several lines', async () => {
    const photoHeight = (xml: string) =>
      Number(
        /<wp:extent cx="\d+" cy="(\d+)"\/>(?:(?!<wp:extent)[\s\S])*?descr="Machine photo"/.exec(
          xml,
        )![1],
      );
    const normal = photoHeight(
      (await build(inspectionPrint(INSPECTION, 'report', CONTEXT))).document,
    );
    const crowded: Inspection = {
      ...INSPECTION,
      front: {
        ...INSPECTION.front,
        machineName: 'M'.repeat(200),
        location: 'L'.repeat(200),
        participants: Array.from({ length: 12 }, (_, n) => `Participant Person${n} Lastname`),
      },
    };
    const smaller = photoHeight(
      (await build(inspectionPrint(crowded, 'report', CONTEXT))).document,
    );
    expect(smaller).toBeLessThan(normal * 0.75);
  });

  it('holds a ref like 10.am on one line: the No. column is 12.5 mm', async () => {
    const sections: Section[] = Array.from({ length: 10 }, (_, s) => ({
      id: id('Sect', s + 1),
      title: `Section ${s + 1}`,
      items: Array.from({ length: s === 9 ? 40 : 1 }, (_, n) => ({
        id: id(`I${s}x`, n + 1),
        text: `Row ${n + 1}`,
      })),
    }));
    const { document } = await build(
      templatePrint(
        {
          id: id('Tmpl', 1),
          name: 'Many sections',
          modelCode: 'RMMG',
          revision: 1,
          status: 'draft',
          printSettings: { spareRowsPerSection: 0 },
          sections,
          updatedAt: '2026-10-07T08:00:00.000Z',
          updatedBy: 'anna@modig.se',
        },
        { ...CONTEXT, draft: false },
      ),
    );
    expect(text(document)).toContain('10.am');
    // 12.5 mm in twips, the first column of every section's table.
    const grids = document.match(/<w:tblGrid>(?:(?!<\/w:tblGrid>)[\s\S])*<\/w:tblGrid>/g) ?? [];
    const sectionGrids = grids.filter((grid) => grid.match(/<w:gridCol /g)?.length === 7);
    expect(sectionGrids).toHaveLength(10);
    for (const grid of sectionGrids) expect(grid).toMatch(/^<w:tblGrid><w:gridCol w:w="709"\/>/);
  });
});

describe('the Word export of a blank checklist', () => {
  const model = inspectionPrint(INSPECTION, 'blank', CONTEXT);

  it('has boxes to tick, the spare rows and the numbered Deviation Summary lines', async () => {
    const { document } = await build(model);
    const all = text(document);
    // Three rows plus three spare rows per section, three boxes each.
    expect(count(all, /☐/g)).toBe((3 + 2 * 3) * 3);
    expect(all).toContain('1.e');
    expect(all).not.toContain('Two screws have no torque mark.');
    expect(all).toContain('No.RefDescriptionSeverityRespClosed (sign/date)');
    for (let n = 1; n <= 15; n += 1) expect(all).toContain(`D-${String(n).padStart(2, '0')}`);
    // Two header rows per section and the summary's own.
    expect(count(document, /<w:tblHeader\/>/g)).toBe(5);
  });

  it('gives blank rows at least 9 mm to write in', async () => {
    const { document } = await build(model);
    // 9.5 mm in twips, "at least".
    expect(count(document, /<w:trHeight w:val="539" w:hRule="atLeast"\/>/g)).toBe(9 + 15);
  });
});

describe('the Word export of a template preview', () => {
  const template: Template = {
    id: id('Tmpl', 1),
    name: 'Final inspection – RigiMill MG',
    modelCode: 'RMMG',
    revision: 3,
    status: 'draft',
    printSettings: { spareRowsPerSection: 0 },
    sections: SECTIONS,
    updatedAt: '2026-10-07T08:00:00.000Z',
    updatedBy: 'anna@modig.se',
  };

  it('is a blank checklist marked as the draft, with its footer', async () => {
    const model = templatePrint(template, { ...CONTEXT, draft: true });
    const { document, footer } = await build(model, { appendix: true });
    expect(text(document)).toContain('Draft – Rev 3');
    expect(text(document)).toContain('Appendix · Reference images');
    expect(text(footer)).toContain(
      'Modig Machine Tool · Final inspection – RigiMill MG · Rev 3 (draft)',
    );
  });
});

describe('the file name', () => {
  it('is the printout’s name with the characters file systems refuse replaced', () => {
    expect(wordFileName('FI-2026-0042 RigiMill MG – Volvo Skövde – Inspection report')).toBe(
      'FI-2026-0042 RigiMill MG – Volvo Skövde – Inspection report.docx',
    );
    expect(wordFileName('FI-2026-0042 Mill/Ex: "A" <B>? – Blank checklist')).toBe(
      'FI-2026-0042 Mill-Ex- -A- -B-- – Blank checklist.docx',
    );
    expect(wordFileName('  Name with\ttabs and trailing dots... ')).toBe(
      'Name with tabs and trailing dots.docx',
    );
    expect(wordFileName('x'.repeat(300))).toBe(`${'x'.repeat(149)}….docx`);
    // A long machine name is shortened, never the kind of printout.
    const long = `FI-2026-0042 ${'M'.repeat(200)}`;
    const blank = wordFileName(`${long} – Blank checklist`);
    const report = wordFileName(`${long} – Inspection report`);
    expect(blank).toMatch(/^FI-2026-0042 M+… – Blank checklist\.docx$/);
    expect(report).toMatch(/^FI-2026-0042 M+… – Inspection report\.docx$/);
    expect(blank.length).toBeLessThanOrEqual(150 + '.docx'.length);
    expect(wordFileName(' ?')).toBe('-.docx');
    expect(wordFileName('   ')).toBe('Final inspection.docx');
  });
});
