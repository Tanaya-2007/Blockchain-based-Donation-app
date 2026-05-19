import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  build: {
    // Prevents chunk naming conflicts with browser extensions
    rollupOptions: {
      output: {
        // Use content hash in filenames so extensions can't intercept
        entryFileNames:   'assets/[name]-[hash].js',
        chunkFileNames:   'assets/[name]-[hash].js',
        assetFileNames:   'assets/[name]-[hash].[ext]',
        // Prevent extension script injection conflicts
        format: 'es',
      }
    },
    // Increase chunk warning limit
    chunkSizeWarningLimit: 1000,
    // Source maps off in production (smaller + no code exposure)
    sourcemap: false,
  },

  server: {
    port: 5173,
    // Proxy API calls to backend in development
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      }
    }
  },

  // Ensure env variables starting with VITE_ are exposed
  envPrefix: 'VITE_',
});