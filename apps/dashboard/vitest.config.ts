import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    svelte({
      hot: false,
      dynamicCompileOptions() {
        return { generate: 'client', css: 'injected' };
      }
    }),
    react({ include: /\.[jt]sx$/ })
  ],
  resolve: {
    alias: [
      // The `sveltekit()` vite plugin is not active under vitest, so kit aliases are declared here.
      // Node's default `svelte` export is the server runtime. Component tests mount the client build.
      { find: /^svelte$/, replacement: path.resolve(currentDir, 'node_modules/svelte/src/index-client.js') },
      { find: '$app/environment', replacement: path.resolve(currentDir, 'src/test-stubs/app-environment.ts') },
      { find: '$env/dynamic/public', replacement: path.resolve(currentDir, 'src/test-stubs/env-dynamic-public.ts') },
      { find: '$env/static/public', replacement: path.resolve(currentDir, 'src/test-stubs/env-static-public.ts') },
      { find: '$lib', replacement: path.resolve(currentDir, 'src/lib') },
      { find: '$features', replacement: path.resolve(currentDir, 'src/lib/features') },
      { find: '$mail', replacement: path.resolve(currentDir, 'src/mail') },
      { find: /^@cio\/ui$/, replacement: path.resolve(currentDir, '../../packages/ui/src') },
      {
        find: /^@cio\/ui\/(.*)$/,
        replacement: `${path.resolve(currentDir, '../../packages/ui/src')}/$1`
      },
      {
        find: /^@cio\/question-types$/,
        replacement: path.resolve(currentDir, '../../packages/question-types/src/index.ts')
      },
      {
        find: /^@cio\/question-types\/(.*)$/,
        replacement: `${path.resolve(currentDir, '../../packages/question-types/src')}/$1`
      },
      { find: /^@cio\/utils$/, replacement: path.resolve(currentDir, '../../packages/utils/src/index.ts') },
      { find: /^@cio\/utils\/(.*)$/, replacement: `${path.resolve(currentDir, '../../packages/utils/src')}/$1` }
    ]
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    server: {
      deps: {
        inline: ['mode-watcher']
      }
    }
  }
});
