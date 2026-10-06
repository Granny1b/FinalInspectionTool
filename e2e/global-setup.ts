import { findSeededDraft } from './support/storage';

/**
 * `npm run dev` runs the seed next to the servers, so the stack can answer before the seeded
 * RigiMill MG template exists. The template tests use it; wait for it once, here.
 */
export default async function globalSetup(): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (!(await findSeededDraft())) {
    if (Date.now() > deadline) {
      throw new Error('The seeded RigiMill MG template did not appear: check the seed output.');
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
