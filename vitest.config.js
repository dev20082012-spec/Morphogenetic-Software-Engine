import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.{test,spec}.js'],
    exclude: [
      '**/node_modules/**',
      '**/test/fixtures/**',
    ],
    pool: 'forks',
    poolOptions: {
      forks: {
        execArgv: [],
      },
    },
    deps: {
      optimizer: {
        ssr: {
          enabled: false,
        },
      },
    },
  },
});

