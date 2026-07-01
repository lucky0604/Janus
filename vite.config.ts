import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const KAVIS_SERVER_PORT = 8787;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  build: {
    emptyOutDir: false,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${KAVIS_SERVER_PORT}`,
        changeOrigin: true,
      },
    },
  },
});
