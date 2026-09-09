import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    // The dev server is reached through a proxied preview host, so every
    // origin must be permitted or the client is refused.
    cors: true,
    allowedHosts: true,
    hmr: { clientPort: 443, protocol: 'wss' },
    watch: { usePolling: false },
  },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
});
