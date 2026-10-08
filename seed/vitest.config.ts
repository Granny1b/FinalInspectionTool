import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: '@modig/seed',
    environment: 'node',
    // Starts a private in-memory Azurite for the storage tests (see the file for why).
    globalSetup: ['./test/azurite-global-setup.ts'],
  },
});
