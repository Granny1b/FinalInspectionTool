/**
 * Settings editing contract (brief §5.6): what an admin may change in `config/settings.json`
 * (PUT /api/settings), checked the same way by the Settings page and the API, and the code
 * suggested for a new machine model.
 */
import { z } from 'zod';
import { IdSchema, MODEL_CODE_PATTERN, type Settings } from './schemas';

/** Far more than Modig builds; the template and inspection pickers list them all. */
export const MAX_MACHINE_MODELS = 100;
/** Per pick list (Responsible, deviation categories): a longer select is hard to use. */
export const MAX_LIST_ENTRIES = 50;
/** As ModelCodeSchema. */
export const MAX_MODEL_CODE_LENGTH = 32;

// The same bounds as the stored schemas (SettingsSchema), with messages for the form.
const ModelCode = z
  .string()
  .trim()
  .min(1, 'Enter a code')
  .max(MAX_MODEL_CODE_LENGTH, `Use at most ${MAX_MODEL_CODE_LENGTH} characters`)
  .regex(MODEL_CODE_PATTERN, 'Use letters and digits only');
const Name = z.string().trim().min(1, 'Enter a name').max(100, 'Use at most 100 characters');
const Text = z.string().trim().max(200, 'Use at most 200 characters');
const List = z.array(Name).max(MAX_LIST_ENTRIES, `At most ${MAX_LIST_ENTRIES} entries`);

/**
 * PUT /api/settings (admin, If-Match): every editable field. `updatedAt` and `updatedBy` are the
 * server's. Model codes, model names and the entries of each list are unique ignoring case: two
 * models called "RigiMill MG", or "Mechanical" twice in the Responsible list, could not be told
 * apart in a picker. A duplicate is reported on the later one, so the first stays as it was.
 */
export const SettingsInputSchema = z
  .object({
    machineModels: z
      .array(z.object({ code: ModelCode, name: Name }))
      .max(MAX_MACHINE_MODELS, `At most ${MAX_MACHINE_MODELS} models`),
    defaultLocation: Text,
    companyName: Text,
    logoImageId: IdSchema.optional(),
    responsibles: List,
    deviationCategories: List,
  })
  .superRefine((input, context) => {
    const models = input.machineModels;
    flagDuplicates(
      models.map((model) => model.code),
      context,
      'Another model has this code',
      ['machineModels'],
      'code',
    );
    flagDuplicates(
      models.map((model) => model.name),
      context,
      'Another model has this name',
      ['machineModels'],
      'name',
    );
    flagDuplicates(input.responsibles, context, 'Already on the list', ['responsibles']);
    flagDuplicates(input.deviationCategories, context, 'Already on the list', [
      'deviationCategories',
    ]);
  });
export type SettingsInput = z.infer<typeof SettingsInputSchema>;

/** The editable fields of stored settings, as the Settings page starts from them. */
export function settingsInput({
  machineModels,
  defaultLocation,
  companyName,
  logoImageId,
  responsibles,
  deviationCategories,
}: Settings): SettingsInput {
  return {
    machineModels: machineModels.map(({ code, name }) => ({ code, name })),
    defaultLocation,
    companyName,
    ...(logoImageId && { logoImageId }),
    responsibles: [...responsibles],
    deviationCategories: [...deviationCategories],
  };
}

/** How list entries, model names and codes are compared: trimmed and ignoring case. */
export function listEntryKey(value: string): string {
  return value.trim().toLocaleLowerCase('sv');
}

function flagDuplicates(
  values: readonly string[],
  context: z.RefinementCtx,
  message: string,
  path: (string | number)[],
  field?: string,
): void {
  const seen = new Set<string>();
  for (const [index, value] of values.entries()) {
    const key = listEntryKey(value);
    if (!key) continue;
    if (seen.has(key)) {
      context.addIssue({
        code: 'custom',
        message,
        path: field ? [...path, index, field] : [...path, index],
      });
    }
    seen.add(key);
  }
}

/**
 * A code for a new model, from its name: the capitals and digits of each word, or a word's first
 * letter when it has none ("RigiMill MG" → "RMMG", "Horizontal machining centre" → "HMC");
 * accents are dropped (Å → A). Fewer than two characters that way, the whole name in capitals
 * ("Rigimill" → "RIGIMILL"). A code already `taken` (ignoring case) gets a number: "RMMG2".
 */
export function suggestModelCode(name: string, taken: Iterable<string> = []): string {
  const words = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  let code = words
    .map((word) => word.match(/[A-Z0-9]/g)?.join('') ?? word[0]!.toUpperCase())
    .join('');
  if (code.length < 2) code = words.join('').toUpperCase();
  code = code.slice(0, MAX_MODEL_CODE_LENGTH);
  if (!code) return '';

  const used = new Set([...taken].map((value) => value.toUpperCase()));
  if (!used.has(code)) return code;
  for (let number = 2; ; number += 1) {
    const suffix = String(number);
    const candidate = code.slice(0, MAX_MODEL_CODE_LENGTH - suffix.length) + suffix;
    if (!used.has(candidate)) return candidate;
  }
}
