import { beforeAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_COMPANY_NAME,
  DEFAULT_SPARE_ROWS_PER_SECTION,
  newId,
  SettingsSchema,
  TemplateSchema,
} from '@modig/shared';
import { parseRealWorkbook, REAL_WORKBOOK_FILE } from '../test/real-workbook';
import { buildSettings, buildTemplateDocuments } from './build-documents';
import type { ParsedWorkbook } from './parse-workbook';

const now = '2026-10-06T09:00:00.000Z';

describe('buildTemplateDocuments', () => {
  let parsed: ParsedWorkbook;
  beforeAll(async () => {
    parsed = await parseRealWorkbook();
  });

  it('builds published revision 2 and a draft carrying revision 3', () => {
    const templateId = newId();
    const { published, draft } = buildTemplateDocuments(parsed, {
      templateId,
      sourceFile: REAL_WORKBOOK_FILE,
      now,
    });

    expect(TemplateSchema.parse(published)).toEqual(published);
    expect(TemplateSchema.parse(draft)).toEqual(draft);
    expect(published).toEqual({
      id: templateId,
      name: 'Final inspection – RigiMill MG',
      modelCode: 'RMMG',
      revision: 2,
      status: 'published',
      printSettings: { spareRowsPerSection: DEFAULT_SPARE_ROWS_PER_SECTION },
      sections: parsed.sections,
      changeNote: 'Imported from Final_Inspection_rev_2.xlsm',
      updatedAt: now,
      updatedBy: 'seed (Final_Inspection_rev_2.xlsm)',
    });
    const { changeNote: _changeNote, ...content } = published;
    expect(draft).toEqual({ ...content, status: 'draft', revision: 3 });
  });

  it('requires the RigiMill MG model', () => {
    const withoutRmmg = { ...parsed, models: parsed.models.filter((m) => m.code !== 'RMMG') };
    expect(() =>
      buildTemplateDocuments(withoutRmmg, { templateId: newId(), sourceFile: 'x.xlsm', now }),
    ).toThrow(/RMMG is missing/);
  });

  it('builds valid settings from the workbook', () => {
    const settings = buildSettings(parsed, now);
    expect(SettingsSchema.parse(settings)).toEqual(settings);
    expect(settings).toEqual({
      machineModels: parsed.models,
      defaultLocation: 'Kalmar, Sweden',
      companyName: DEFAULT_COMPANY_NAME,
      updatedAt: now,
      updatedBy: 'seed',
    });
  });
});
