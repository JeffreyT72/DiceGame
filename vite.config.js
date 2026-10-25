import { defineConfig } from 'vite';

export default defineConfig({
  root: 'client',
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/ws': {
        target: 'http://127.0.0.1:3000',
        ws: true,
      },
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
