import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Separate build config for the embed - creates a truly minimal bundle
export default defineConfig({
  plugins: [react()],
  base: '/embed/',
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: 'dist-embed',
    rollupOptions: {
      input: path.resolve(__dirname, 'embed.html'),
      output: {
        // Inline everything into a single chunk - no code splitting
        // This ensures only what's actually used by the embed is included
        inlineDynamicImports: true,
      },
    },
  },
})
