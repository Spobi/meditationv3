import { defineConfig } from 'vite';

export default defineConfig({
  root: 'client',
  server: { port: 5004 },
  build: { outDir: '../dist', emptyOutDir: true }
});
