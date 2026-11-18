import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  base: './', // chemins relatifs : fonctionne dans l'APK, sur GitHub Pages et derrière le serveur dédié
  envDir: '..', // lit le .env à la racine du monorepo (variables VITE_*)
  resolve: { alias: { '@shared': resolve(__dirname, '../shared/src') } },
  server: { port: 5173, host: true, fs: { allow: ['..'] } },
});
