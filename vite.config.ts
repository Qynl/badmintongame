import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], server: { host: '0.0.0.0', allowedHosts: true }, // Three.js is intentionally cached as one vendor chunk; application code is separate.
  build: { chunkSizeWarningLimit: 800, rollupOptions: { output: { manualChunks: { 'three-core': ['three'], 'react-core': ['react', 'react-dom', 'zustand'] } } } } });
