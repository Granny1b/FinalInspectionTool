import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: '@modig/api',
    environment: 'node',
    // A private in-memory Azurite for the storage tests (see the file for why).
    globalSetup: ['./test/azurite-global-setup.ts'],
    // The endpoint tests share that Azurite and reset the templates and settings before each
    // test, so the files run one after another (still only a few seconds).
    fileParallelism: false,
  },
});
