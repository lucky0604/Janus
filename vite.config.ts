import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { configureApiRoutes } from './server/index';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'kavis-api-routes',
      configureServer(server) {
        configureApiRoutes(server);
      },
    },
  ],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  build: {
    emptyOutDir: false, // Preserve tsc-compiled server/*.js files in dist/
  },
  server: {
    port: 5173,
  },
});
