import { describe, expect, it } from 'vitest';
import { DEFAULT_DEVIATION_CATEGORIES, DEFAULT_RESPONSIBLES } from './constants';
import { SettingsSchema, type Settings } from './schemas';
import {
  MAX_LIST_ENTRIES,
  MAX_MACHINE_MODELS,
  settingsInput,
  SettingsInputSchema,
  suggestModelCode,
  type SettingsInput,
} from './settings';

const input: SettingsInput = {
  machineModels: [
    { code: 'RMMG', name: 'RigiMill MG' },
    { code: 'IM', name: 'IM8' },
  ],
  defaultLocation: 'Kalmar, Sweden',
  companyName: 'Modig Machine Tool',
  responsibles: [...DEFAULT_RESPONSIBLES],
  deviationCategories: [...DEFAULT_DEVIATION_CATEGORIES],
};

/** The zod issues as `path: message`. */
function problems(value: unknown): string[] {
  const result = SettingsInputSchema.safeParse(value);
  return result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

describe('SettingsInputSchema', () => {
  it('accepts the defaults, and the result is valid stored settings', () => {
    const parsed = SettingsInputSchema.parse(input);
    expect(parsed).toEqual(input);
    const stored: Settings = { ...parsed, updatedAt: '2026-11-04T10:00:00.000Z', updatedBy: 'x' };
    expect(SettingsSchema.parse(stored)).toEqual(stored);
  });

  it('trims every text and allows empty lists, location and company name', () => {
    expect(
      SettingsInputSchema.parse({
        machineModels: [{ code: ' RMMG ', name: ' RigiMill MG ' }],
        defaultLocation: '  ',
        companyName: ' Modig ',
        responsibles: [' Mechanical '],
        deviationCategories: [],
      }),
    ).toEqual({
      machineModels: [{ code: 'RMMG', name: 'RigiMill MG' }],
      defaultLocation: '',
      companyName: 'Modig',
      responsibles: ['Mechanical'],
      deviationCategories: [],
    });
  });

  it('wants model codes of letters and digits, and a name for every model and entry', () => {
    expect(
      problems({
        ...input,
        machineModels: [
          { code: 'RM/MG', name: 'RigiMill MG' },
          { code: '', name: ' ' },
          { code: 'X'.repeat(33), name: 'X'.repeat(101) },
        ],
        responsibles: ['Mechanical', '  '],
      }),
    ).toEqual([
      'machineModels.0.code: Use letters and digits only',
      'machineModels.1.code: Enter a code',
      'machineModels.1.code: Use letters and digits only',
      'machineModels.1.name: Enter a name',
      'machineModels.2.code: Use at most 32 characters',
      'machineModels.2.name: Use at most 100 characters',
      'responsibles.1: Enter a name',
    ]);
  });

  it('flags the later of two models with the same code or name, ignoring case', () => {
    expect(
      problems({
        ...input,
        machineModels: [
          { code: 'RMMG', name: 'RigiMill MG' },
          { code: 'rmmg', name: 'Another' },
          { code: 'RMMT', name: 'rigimill mg' },
        ],
      }),
    ).toEqual([
      'machineModels.1.code: Another model has this code',
      'machineModels.2.name: Another model has this name',
    ]);
  });

  it('flags entries that are already on their list, ignoring case and spaces', () => {
    expect(
      problems({
        ...input,
        responsibles: ['Mechanical', 'Media', ' mechanical', 'MECHANICAL'],
        deviationCategories: ['Leakage', 'Missing parts', 'leakage '],
      }),
    ).toEqual([
      'responsibles.2: Already on the list',
      'responsibles.3: Already on the list',
      'deviationCategories.2: Already on the list',
    ]);
  });

  it('limits how many models and entries there are, and how long the texts are', () => {
    const models = Array.from({ length: MAX_MACHINE_MODELS + 1 }, (_, index) => ({
      code: `M${index}`,
      name: `Model ${index}`,
    }));
    const entries = Array.from({ length: MAX_LIST_ENTRIES + 1 }, (_, index) => `Entry ${index}`);
    expect(
      problems({
        ...input,
        machineModels: models,
        defaultLocation: 'x'.repeat(201),
        companyName: 'x'.repeat(201),
        responsibles: entries,
        deviationCategories: entries,
      }),
    ).toEqual([
      'machineModels: At most 100 models',
      'defaultLocation: Use at most 200 characters',
      'companyName: Use at most 200 characters',
      'responsibles: At most 50 entries',
      'deviationCategories: At most 50 entries',
    ]);
  });

  it('takes a logo id, and nothing the server owns', () => {
    const parsed = SettingsInputSchema.parse({
      ...input,
      logoImageId: 'Logo000000000001',
      updatedAt: '2026-11-04T10:00:00.000Z',
      updatedBy: 'someone',
    });
    expect(parsed.logoImageId).toBe('Logo000000000001');
    expect(parsed).not.toHaveProperty('updatedAt');
    expect(parsed).not.toHaveProperty('updatedBy');
    expect(problems({ ...input, logoImageId: '../etc' })).toEqual(['logoImageId: Invalid id']);
  });
});

describe('settingsInput', () => {
  it('is the editable part of stored settings', () => {
    const stored: Settings = {
      ...input,
      logoImageId: 'Logo000000000001',
      updatedAt: '2026-11-04T10:00:00.000Z',
      updatedBy: 'anna@modig.se',
    };
    expect(settingsInput(stored)).toEqual({ ...input, logoImageId: 'Logo000000000001' });
    expect(settingsInput({ ...stored, logoImageId: undefined })).not.toHaveProperty('logoImageId');
  });
});

describe('suggestModelCode', () => {
  it.each([
    ['RigiMill MG', 'RMMG'],
    ['RigiMill MT', 'RMMT'],
    ['IM8', 'IM8'],
    ['Horizontal machining centre', 'HMC'],
    ['HMC 500 – twin pallet', 'HMC500TP'],
    ['Rigimill', 'RIGIMILL'],
    ['Åbro fräs', 'AF'],
    ['  ', ''],
    ['–', ''],
  ])('%s → %s', (name, code) => {
    expect(suggestModelCode(name)).toBe(code);
  });

  it('numbers a code that is taken, ignoring case', () => {
    expect(suggestModelCode('RigiMill MG', ['rmmg'])).toBe('RMMG2');
    expect(suggestModelCode('RigiMill MG', ['RMMG', 'RMMG2'])).toBe('RMMG3');
  });

  it('stays within 32 characters, the number included', () => {
    const name = 'A'.repeat(40);
    expect(suggestModelCode(name)).toBe('A'.repeat(32));
    expect(suggestModelCode(name, ['A'.repeat(32)])).toBe(`${'A'.repeat(31)}2`);
  });
});
