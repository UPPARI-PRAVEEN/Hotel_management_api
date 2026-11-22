import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const frontendDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: frontendDirectory,
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/health': 'http://localhost:3000'
    }
  },
  build: {
    outDir: path.resolve(frontendDirectory, '../public'),
    emptyOutDir: true
  }
});
