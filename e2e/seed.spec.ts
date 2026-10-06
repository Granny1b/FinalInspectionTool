import { expect, test } from '@playwright/test';
import { findSeededDraft } from './support/storage';

// The global setup has already waited for the seed to finish.
test('npm run dev seeds the RigiMill MG checklist from the workbook', async () => {
  const draft = await findSeededDraft();

  expect(draft?.status).toBe('draft');
  expect(draft?.sections).toHaveLength(6);
  expect(draft?.sections.flatMap((section) => section.items)).toHaveLength(90);
});
