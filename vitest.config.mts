import { resolve } from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

/** Espelha `paths` de tsconfig.base.json e o mapa de `node.loader.ts`. */
const aliases = {
  '@zero/types': resolve(import.meta.dirname, 'src/types'),
  '@zero/messages': resolve(import.meta.dirname, 'src/messages'),
  '@zero/main': resolve(import.meta.dirname, 'src/main'),
  '@zero/preload': resolve(import.meta.dirname, 'src/preload'),
  '@zero/renderer': resolve(import.meta.dirname, 'src/renderer/src'),
  electron: resolve(import.meta.dirname, 'tests/mocks/electron.ts'),
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: aliases,
  },
  test: {
    name: 'guardinha',
    root: import.meta.dirname,
    environment: 'jsdom',
    pool: 'forks',
    clearMocks: false,
    // Argon2id real (64 MB, t=3) roda em deguardinhas de testes: sob carga o KDF
    // passa de 5 s e o limite padrão do Vitest vira falso positivo.
    testTimeout: 30_000,
    setupFiles: ['tests/setup-env.ts', 'tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/renderer/src/global.d.ts', 'src/renderer/index.html'],
      thresholds: {
        lines: 50,
        statements: 50,
        functions: 50,
        branches: 50,
      },
    },
  },
});
