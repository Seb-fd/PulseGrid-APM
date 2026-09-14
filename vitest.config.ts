import { defineConfig } from 'vitest/config';
import angular from '@analogjs/vite-plugin-angular';
import viteTsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig(({ mode }) => ({
  plugins: [
    angular({
      tsconfig: mode === 'test' ? './tsconfig.spec.json' : './tsconfig.app.json',
    }),
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.spec.ts'],
    exclude: ['node_modules', 'dist', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov', 'html'],
      reportsDirectory: './coverage',
      include: ['src/app/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/main.ts', 'src/test-setup.ts', '**/*.routes.ts'],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
    },
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
  },
}));
