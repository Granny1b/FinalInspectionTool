import { defineConfig } from 'vitest/config';

// Each workspace is a Vitest project; a workspace may add its own vitest.config.ts (or vite.config.ts).
export default defineConfig({
  test: {
    projects: ['shared', 'api', 'seed', 'app'],
  },
});
