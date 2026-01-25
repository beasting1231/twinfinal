import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Separate build config for the gift voucher embed
export default defineConfig({
  plugins: [react()],
  base: '/embed-voucher/',
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: 'dist-embed-voucher',
    rollupOptions: {
      input: path.resolve(__dirname, 'embed-voucher.html'),
      output: {
        // Inline everything into a single chunk - no code splitting
        inlineDynamicImports: true,
      },
    },
  },
})
