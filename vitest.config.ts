import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'unit', environment: 'node', include: ['tests/unit/**/*.test.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'component',
          environment: 'jsdom',
          include: ['tests/component/**/*.test.tsx'],
        },
      },
      {
        // Contract tests need the container stack. They are excluded from `npm test`
        // on purpose: a suite that fails because Docker is down teaches nothing.
        extends: true,
        test: {
          name: 'contract',
          environment: 'node',
          include: ['tests/contract/**/*.test.ts'],
          // One file at a time. These tests share one container stack - one
          // Odoo, one Tesseract, one Meilisearch, one database - so they are
          // not isolated by construction, and running them in parallel made
          // them interfere in two distinct ways: seed-state caught invoices
          // another file was creating, and increment 1E's extra onboarding test
          // pushed concurrent OCR reads past a 30 second timeout in CI while
          // passing locally. Sequential is slower and correct; the alternative
          // is a suite whose result depends on how fast the machine is.
          fileParallelism: false,
          // Only this project loads .env. The unit and component projects need
          // no stack and must not start requiring one.
          setupFiles: ['tests/contract/setup.ts'],
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
      {
        // Browser tests need a built application and a Chromium binary, so they
        // are excluded from `npm test` for the same reason the contract project
        // is: a suite that fails because a dependency is not running teaches
        // nothing. They exist because jsdom has no layout engine, and three of
        // the things an accessibility claim is about are computed style.
        extends: true,
        test: {
          name: 'browser',
          environment: 'node',
          include: ['tests/browser/**/*.test.ts'],
          // One file at a time. Each file drives its own Chromium against one
          // shared application and one shared database, and the performance
          // budgets measure a page under load - so a parallel run would have
          // the suite competing with itself for the thing it is measuring.
          fileParallelism: false,
          setupFiles: ['tests/contract/setup.ts'],
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
