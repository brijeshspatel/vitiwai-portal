import next from 'eslint-config-next';

// `eslint-config-next` exports a flat-config array, not a factory. Verified by
// importing it and reading the export: an array of 3 entries.
const config = [
  { ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'out/**', 'next-env.d.ts'] },
  ...next,
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      // An adapter may only be named by the composition module. Everything else
      // depends on a port, which is what makes phase 2 a configuration change.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/adapters/*', '@/adapters/*'],
              message:
                'Import the port, not the adapter. Only src/composition.ts may name an adapter.',
            },
          ],
        },
      ],
    },
  },
  {
    // The composition module exists precisely to name adapters.
    files: ['src/composition.ts', 'src/adapters/**', 'scripts/**', 'tests/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
];

export default config;
