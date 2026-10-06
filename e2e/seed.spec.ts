import { BlobServiceClient } from '@azure/storage-blob';
import { CONTAINERS, TemplateSchema, type Template } from '@modig/shared';
import { expect, test } from '@playwright/test';

/** The Azurite that `npm run dev` starts (default ports) — not STORAGE_CONNECTION_STRING. */
const LOCAL_STORAGE = 'UseDevelopmentStorage=true';

/** The seeded RigiMill MG draft, or null while the seed (started with `npm run dev`) is running. */
async function findRigiMillDraft(): Promise<Template | null> {
  const templates = BlobServiceClient.fromConnectionString(LOCAL_STORAGE).getContainerClient(
    CONTAINERS.templates,
  );
  if (!(await templates.exists())) return null;
  for await (const blob of templates.listBlobsFlat()) {
    if (!blob.name.endsWith('/draft.json')) continue;
    const content = await templates.getBlobClient(blob.name).downloadToBuffer();
    const template = TemplateSchema.parse(JSON.parse(content.toString('utf8')));
    if (template.modelCode === 'RMMG') return template;
  }
  return null;
}

test('npm run dev seeds the RigiMill MG checklist from the workbook', async () => {
  await expect.poll(findRigiMillDraft, { timeout: 30_000 }).not.toBeNull();
  const draft = await findRigiMillDraft();

  expect(draft?.status).toBe('draft');
  expect(draft?.sections).toHaveLength(6);
  expect(draft?.sections.flatMap((section) => section.items)).toHaveLength(90);
});
