import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Explicit demo values override .env so this preview cannot use production.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  define: Object.fromEntries(Object.entries({
    VITE_FIREBASE_API_KEY: 'demo-history-key',
    VITE_FIREBASE_PROJECT_ID: 'demo-twin-history',
    VITE_FIREBASE_AUTH_DOMAIN: 'demo-twin-history.firebaseapp.com',
    VITE_FIREBASE_STORAGE_BUCKET: 'demo-twin-history.appspot.com',
    VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
    VITE_FIREBASE_APP_ID: 'demo-history-app',
    VITE_FIREBASE_VAPID_KEY: '',
    VITE_USE_FIREBASE_EMULATORS: 'true',
  }).map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)])),
  server: { host: '127.0.0.1', port: 5178, strictPort: true },
});
