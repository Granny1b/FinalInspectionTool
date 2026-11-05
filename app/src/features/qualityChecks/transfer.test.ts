import { qualityCheckExport, templateExport, type TemplateDraftInput } from '@modig/shared';
import { describe, expect, it } from 'vitest';
import { TemplateFileError } from '../templates/transfer';
import { parseQualityCheckFile, qualityCheckFileName, readQualityCheckFile } from './transfer';

const draft: TemplateDraftInput = {
  name: 'QC4 · Pre start up',
  modelCode: 'RMMG',
  coverImageId: undefined,
  quality: {
    position: 'QC4',
    operation: 'Pre start up',
    department: 'Quality',
    documentNumber: '1.22.2',
    madeBy: 'Sam Andersson',
    date: '2026-11-05',
  },
  sections: [
    {
      id: 'Sect000000000001',
      title: 'Safety features',
      items: [
        {
          id: 'Item000000000001',
          text: 'Safety decals on the X motors',
          how: 'Visible, not turned inward',
          references: ['ISO 12100'],
          timeHours: 0.2,
        },
      ],
    },
  ],
};
const file = qualityCheckExport(draft, 'RigiMill MG', '2026-11-05T08:00:00.000Z');
const text = (value: unknown) => JSON.stringify(value);

describe('qualityCheckFileName', () => {
  it('is the position, operation and machine, safe for any file system', () => {
    expect(qualityCheckFileName(draft.quality, 'RigiMill MG')).toBe(
      'QC4 Pre start up – RigiMill MG.json',
    );
    expect(qualityCheckFileName({ position: 'QC1', operation: '' }, undefined)).toBe('QC1.json');
    expect(qualityCheckFileName({ position: 'QC/2', operation: 'A:B' }, 'IM8')).toBe(
      'QC-2 A-B – IM8.json',
    );
    expect(qualityCheckFileName(undefined, 'IM8')).toBe('Quality check – IM8.json');
  });
});

describe('parseQualityCheckFile', () => {
  it('reads back an exported quality check, every field of its rows included', () => {
    expect(parseQualityCheckFile(JSON.stringify(file, null, 2))).toEqual(file);
  });

  it.each([
    ['text that is not JSON', 'QC4', /does not contain JSON/],
    ['JSON of something else', text({ name: 'x' }), /not a quality check file/],
    [
      'a final inspection template file',
      text(templateExport(draft, 'RigiMill MG', file.exportedAt)),
      /This is a final inspection template file\. Import it with Import JSON on the Templates page\./,
    ],
    ['a newer version', text({ ...file, version: 2 }), /newer version/],
    [
      'a damaged file',
      text({ ...file, qualityCheck: { ...file.qualityCheck, quality: { position: 'QC4' } } }),
      /damaged or incomplete \(at qualityCheck\.quality\.operation\)/,
    ],
  ])('explains %s', (_case, content, message) => {
    expect(() => parseQualityCheckFile(content)).toThrow(TemplateFileError);
    expect(() => parseQualityCheckFile(content)).toThrow(message);
  });

  it('refuses a file too big to be a quality check', async () => {
    const big = new Blob(['x'.repeat(5 * 1024 * 1024 + 1)]);
    await expect(readQualityCheckFile(big)).rejects.toThrow('too big');
    await expect(readQualityCheckFile(new Blob([text(file)]))).resolves.toEqual(file);
  });
});
