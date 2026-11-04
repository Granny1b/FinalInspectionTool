/**
 * The Settings page's form (brief §5.6): what is being edited, and the pure, immutable edits of
 * it. Each model and list entry carries a key of its own, so React keeps its input (and the
 * focus) while entries are renamed, moved or removed.
 */
import {
  listEntryKey,
  SettingsInputSchema,
  suggestModelCode,
  type SettingsInput,
} from '@modig/shared';

export type ModelRow = {
  key: string;
  code: string;
  name: string;
  /** In the saved settings: its code is fixed, because templates and inspections use it. */
  saved: boolean;
  /** A new model's code follows its name until it is edited. */
  codeEdited: boolean;
};

export type ListRow = { key: string; value: string };

export type SettingsForm = {
  models: ModelRow[];
  defaultLocation: string;
  companyName: string;
  logoImageId: string | undefined;
  responsibles: ListRow[];
  deviationCategories: ListRow[];
};

/** The two pick lists, edited with the same list editor. */
export type ListName = 'responsibles' | 'deviationCategories';

let lastKey = 0;
/** A key for React, unique for the page's lifetime. */
export function newKey(): string {
  lastKey += 1;
  return `k${lastKey}`;
}

export function formFromInput(input: SettingsInput): SettingsForm {
  return {
    models: input.machineModels.map(({ code, name }) => ({
      key: newKey(),
      code,
      name,
      saved: true,
      codeEdited: true,
    })),
    defaultLocation: input.defaultLocation,
    companyName: input.companyName,
    logoImageId: input.logoImageId,
    responsibles: input.responsibles.map(listRow),
    deviationCategories: input.deviationCategories.map(listRow),
  };
}

/**
 * The form after a save of `sent`, which the server stored as `stored` (trimmed). Rows keep
 * their keys, so the field that had the focus (Enter saves) keeps it. Changes made while the save
 * ran are kept, still unsaved; either way every model that was saved now has a fixed code.
 */
export function savedForm(
  form: SettingsForm,
  sent: SettingsInput,
  stored: SettingsInput,
): SettingsForm {
  if (isDirty(form, sent)) {
    const codes = new Set(stored.machineModels.map((model) => model.code));
    return {
      ...form,
      models: form.models.map((row) =>
        !row.saved && codes.has(row.code.trim())
          ? { ...row, code: row.code.trim(), saved: true, codeEdited: true }
          : row,
      ),
    };
  }
  const fresh = formFromInput(stored);
  const keep = <T extends { key: string }>(rows: T[], previous: readonly { key: string }[]) =>
    rows.length === previous.length
      ? rows.map((row, i) => ({ ...row, key: previous[i]!.key }))
      : rows;
  return {
    ...fresh,
    models: keep(fresh.models, form.models),
    responsibles: keep(fresh.responsibles, form.responsibles),
    deviationCategories: keep(fresh.deviationCategories, form.deviationCategories),
  };
}

/** What Save sends, as typed: the schema trims it. */
export function inputFromForm(form: SettingsForm): SettingsInput {
  return {
    machineModels: form.models.map(({ code, name }) => ({ code, name })),
    defaultLocation: form.defaultLocation,
    companyName: form.companyName,
    ...(form.logoImageId && { logoImageId: form.logoImageId }),
    responsibles: form.responsibles.map((row) => row.value),
    deviationCategories: form.deviationCategories.map((row) => row.value),
  };
}

/** Whether the form differs from what is saved (exactly as typed: a space counts). */
export function isDirty(form: SettingsForm, saved: SettingsInput): boolean {
  return JSON.stringify(inputFromForm(form)) !== JSON.stringify(saved);
}

/** Problems by field id (fieldId), in form order; empty when the form can be saved. */
export function formErrors(form: SettingsForm): Map<string, string> {
  const result = SettingsInputSchema.safeParse(inputFromForm(form));
  return result.success ? new Map() : issueMap(form, result.error.issues);
}

/** Zod issues (the form's own, or a 400's `details`) by field id; the first per field wins. */
export function issueMap(
  form: SettingsForm,
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): Map<string, string> {
  const byField = new Map<string, string>();
  for (const issue of issues) {
    const id = fieldIdOf(form, issue.path);
    if (id && !byField.has(id)) byField.set(id, issue.message);
  }
  // In the order of the form, so the first one is the field to focus.
  const order = fieldOrder(form);
  return new Map([...byField].sort(([a], [b]) => order.indexOf(a) - order.indexOf(b)));
}

/**
 * The DOM id of a field. Models and entries are named by their keys, so an error stays on its
 * field when the list around it changes.
 */
export const fieldId = {
  modelName: (key: string) => `settings-model-${key}-name`,
  modelCode: (key: string) => `settings-model-${key}-code`,
  models: 'settings-models',
  entry: (key: string) => `settings-entry-${key}`,
  list: (list: ListName) => `settings-${list}`,
  defaultLocation: 'settings-default-location',
  companyName: 'settings-company-name',
  logo: 'settings-logo',
};

function fieldIdOf(form: SettingsForm, path: readonly PropertyKey[]): string | null {
  const [field, index, part] = path;
  switch (field) {
    case 'machineModels': {
      const row = typeof index === 'number' ? form.models[index] : undefined;
      if (!row) return fieldId.models;
      return part === 'code' ? fieldId.modelCode(row.key) : fieldId.modelName(row.key);
    }
    case 'responsibles':
    case 'deviationCategories': {
      const row = typeof index === 'number' ? form[field][index] : undefined;
      return row ? fieldId.entry(row.key) : fieldId.list(field);
    }
    case 'defaultLocation':
      return fieldId.defaultLocation;
    case 'companyName':
      return fieldId.companyName;
    case 'logoImageId':
      return fieldId.logo;
    default:
      return null;
  }
}

function fieldOrder(form: SettingsForm): string[] {
  return [
    fieldId.models,
    ...form.models.flatMap((row) => [fieldId.modelName(row.key), fieldId.modelCode(row.key)]),
    fieldId.list('responsibles'),
    ...form.responsibles.map((row) => fieldId.entry(row.key)),
    fieldId.list('deviationCategories'),
    ...form.deviationCategories.map((row) => fieldId.entry(row.key)),
    fieldId.defaultLocation,
    fieldId.companyName,
    fieldId.logo,
  ];
}

// --- Machine models ---------------------------------------------------------------------------

export function addModel(models: readonly ModelRow[]): { models: ModelRow[]; key: string } {
  const row: ModelRow = { key: newKey(), code: '', name: '', saved: false, codeEdited: false };
  return { models: [...models, row], key: row.key };
}

/** A new model's code follows its name (unique among the others) until the code is edited. */
export function renameModel(models: readonly ModelRow[], key: string, name: string): ModelRow[] {
  return models.map((row) => {
    if (row.key !== key) return row;
    if (row.saved || row.codeEdited) return { ...row, name };
    const others = models.filter((other) => other.key !== key).map((other) => other.code);
    return { ...row, name, code: suggestModelCode(name, others) };
  });
}

/** Only a new model's code can change. Emptied, it follows the name again. */
export function setModelCode(models: readonly ModelRow[], key: string, code: string): ModelRow[] {
  return models.map((row) =>
    row.key === key && !row.saved ? { ...row, code, codeEdited: code !== '' } : row,
  );
}

export function removeModel(models: readonly ModelRow[], key: string): ModelRow[] {
  return models.filter((row) => row.key !== key);
}

// --- Pick lists -------------------------------------------------------------------------------

/** Why `value` can't be added to the list, or null when it can. */
export function addProblem(rows: readonly ListRow[], value: string): string | null {
  const key = listEntryKey(value);
  if (!key) return 'Type a name first';
  if (rows.some((row) => listEntryKey(row.value) === key)) return 'Already on the list';
  return null;
}

export function addEntry(rows: readonly ListRow[], value: string): ListRow[] {
  return [...rows, listRow(value.trim())];
}

export function renameEntry(rows: readonly ListRow[], key: string, value: string): ListRow[] {
  return rows.map((row) => (row.key === key ? { ...row, value } : row));
}

export function removeEntry(rows: readonly ListRow[], key: string): ListRow[] {
  return rows.filter((row) => row.key !== key);
}

/** One place up (-1) or down (+1); at the end of the list it stays. */
export function moveEntry(rows: readonly ListRow[], key: string, by: -1 | 1): ListRow[] {
  const from = rows.findIndex((row) => row.key === key);
  const to = from + by;
  if (from < 0 || to < 0 || to >= rows.length) return [...rows];
  const next = [...rows];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

function listRow(value: string): ListRow {
  return { key: newKey(), value };
}
