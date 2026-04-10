import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@/types',
        replacement: fileURLToPath(new URL('./types', import.meta.url)),
      },
      {
        find: '@',
        replacement: fileURLToPath(new URL('./src', import.meta.url)),
      },
    ],
  },
});
