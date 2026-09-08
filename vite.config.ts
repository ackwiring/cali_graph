import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  server: {
    host: '0.0.0.0',
    port: 1973,
    open: false,
    allowedHosts: true
  },
  build: {
    target: 'esnext',
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000000,
    cssCodeSplit: false
  },
  optimizeDeps: {
    exclude: ['@electric-sql/pglite']
  }
});
