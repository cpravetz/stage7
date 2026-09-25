import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
  },
  server: {
    port: 8080,
    proxy: {
      '/api/agent-runtime': {
        target: 'http://localhost:3400',
        changeOrigin: true,
      },
      '/api/temporal': {
        target: 'http://localhost:4100',
        changeOrigin: true,
      },
      '/api/auth': {
        target: 'http://localhost:4300',
        changeOrigin: true,
      },
      '/api/brain': {
        target: 'http://localhost:3100',
        changeOrigin: true,
      },
      '/api/workers': {
        target: 'http://localhost:3200',
        changeOrigin: true,
      },
      '/api/vault': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/api/persistence': {
        target: 'http://localhost:4200',
        changeOrigin: true,
      },
      '/api/artifacts': {
        target: 'http://localhost:4200',
        changeOrigin: true,
      },
      '/api/tool-executor': {
        target: 'http://localhost:3500',
        changeOrigin: true,
      },
      '/api/mcp-runtime': {
        target: 'http://localhost:3300',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
