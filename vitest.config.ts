import { fileURLToPath } from 'node:url';

import { configDefaults, defineConfig } from 'vitest/config';

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
  // Match Next's JSX transform so components render in tests without each file
  // importing React explicitly.
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
});
