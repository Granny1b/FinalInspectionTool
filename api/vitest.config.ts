import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: '@modig/api',
    environment: 'node',
    // A private in-memory Azurite for the storage tests (see the file for why).
    globalSetup: ['./test/azurite-global-setup.ts'],
  },
});
