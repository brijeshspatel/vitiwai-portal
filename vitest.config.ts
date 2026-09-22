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
    ],
  },
});
