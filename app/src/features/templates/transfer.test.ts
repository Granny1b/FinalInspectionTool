import { qualityCheckExport, templateExport, type TemplateDraftInput } from '@modig/shared';
import { describe, expect, it } from 'vitest';
import {
  parseTemplateFile,
  readTemplateFile,
  TemplateFileError,
  templateFileName,
} from './transfer';

const draft: TemplateDraftInput = {
  name: 'Final inspection – RigiMill MG',
  modelCode: 'RMMG',
  coverImageId: undefined,
  sections: [
    {
      id: 'Sect000000000001',
      title: 'Loading area',
      items: [{ id: 'Item000000000001', text: 'Lifting columns - Marked screws' }],
    },
  ],
};
const file = templateExport(draft, 'RigiMill MG', '2026-11-04T08:00:00.000Z');
const text = (value: unknown) => JSON.stringify(value);

describe('templateFileName', () => {
  it("is the template's name, safe for any file system", () => {
    expect(templateFileName('Final inspection – RigiMill MG')).toBe(
      'Final inspection – RigiMill MG.json',
    );
    expect(templateFileName(' HMC: 800/2 "new"  <draft>? ')).toBe('HMC- 800-2 -new- -draft--.json');
    expect(templateFileName('Ends in dots...')).toBe('Ends in dots.json');
    expect(templateFileName('  ')).toBe('Template.json');
    expect(templateFileName('x'.repeat(300))).toBe(`${'x'.repeat(150)}.json`);
  });
});

describe('parseTemplateFile', () => {
  it('reads back an exported template', () => {
    expect(parseTemplateFile(JSON.stringify(file, null, 2))).toEqual(file);
  });

  it('reads a file exported before spare lines were removed, without them', () => {
    const old = {
      ...file,
      template: {
        ...file.template,
        printSettings: { spareRowsPerSection: 3 },
        sections: file.template.sections.map((section) => ({ ...section, spareRows: 1 })),
      },
    };
    expect(parseTemplateFile(text(old))).toEqual(file);
  });

  it.each([
    ['text that is not JSON', 'Final inspection', /does not contain JSON/],
    ['JSON of something else', text({ name: 'x' }), /not a template file/],
    ['a JSON list', text([file]), /not a template file/],
    ['a newer version', text({ ...file, version: 2 }), /newer version/],
    [
      'a quality check file',
      text(qualityCheckExport({ ...draft, quality: undefined }, undefined, file.exportedAt)),
      /This is a quality check file\. Import it on the Quality checks tab/,
    ],
    [
      'a damaged file',
      text({ ...file, template: { ...file.template, sections: [{ id: 'x' }] } }),
      /damaged or incomplete \(at template\.sections\.0\.title\)/,
    ],
  ])('explains %s', (_case, content, message) => {
    expect(() => parseTemplateFile(content)).toThrow(TemplateFileError);
    expect(() => parseTemplateFile(content)).toThrow(message);
  });

  it('refuses a file too big to be a template', async () => {
    const big = new Blob(['x'.repeat(5 * 1024 * 1024 + 1)]);
    await expect(readTemplateFile(big)).rejects.toThrow('too big');
    await expect(readTemplateFile(new Blob([text(file)]))).resolves.toEqual(file);
  });
});
