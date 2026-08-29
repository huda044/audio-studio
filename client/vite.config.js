import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Sebelumnya pakai viteSingleFile (semua JS+CSS di-inline ke index.html). Sekarang
// dilepas agar kode bisa di-split per-chunk → initial load jauh lebih ringan, vendor
// (React/framer-motion/lucide) di-cache terpisah 1 tahun oleh browser, dan pages bisa
// di-lazy-load. Express static handler di server sudah melayani multi-file dengan benar.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    // Target modern → output lebih kecil (skip polyfill untuk browser lama).
    target: 'es2020',
    cssCodeSplit: true,
    // Matikan inline module-preload polyfill: itu satu-satunya <script> inline di
    // index.html hasil build, dan CSP server melarang script inline
    // (script-src 'self') sebagai proteksi XSS.
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        // Nama file stabil berbasis hash untuk long-term caching.
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        manualChunks: {
          // React core jarang berubah → cache-nya reusable lama.
          'react-vendor': ['react', 'react-dom'],
          // lucide-react: tree-shaken, tapi tetap layak di-chunk terpisah.
          icons: ['lucide-react']
        }
      }
    }
  }
});
