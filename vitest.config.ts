import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The database module keeps an in-memory cache, so run files one at a time.
    fileParallelism: false,
  },
});
