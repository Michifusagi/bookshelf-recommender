import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const edgeOneDevServer = 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/chat': edgeOneDevServer,
      '/stop': edgeOneDevServer,
      '/recommend': edgeOneDevServer,
      '/history': edgeOneDevServer,
      '/clear-history': edgeOneDevServer,
      '/conversations': edgeOneDevServer,
      '/delete-conversation': edgeOneDevServer,
    },
  },
});
