import { expect, test } from '@playwright/test';
import { findSeededRevision } from './support/storage';

// The global setup has already waited for the seed to finish.
test('npm run dev seeds the RigiMill MG checklist from the workbook', async () => {
  const seeded = await findSeededRevision();

  expect(seeded?.complete).toBe(true);
  const revision = seeded?.revision;
  expect(revision).toMatchObject({ status: 'published', revision: 2 });
  expect(revision?.sections).toHaveLength(6);
  expect(revision?.sections.flatMap((section) => section.items)).toHaveLength(90);
});
