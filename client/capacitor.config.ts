import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Configuration de l'APK Android (Capacitor).
 * Le jeu est le même que le site : le build Vite (dist/) est embarqué dans l'appli.
 */
const config: CapacitorConfig = {
  appId: 'com.volkodlack.hexdeck',
  appName: 'HEX DECK',
  webDir: 'dist',
  android: {
    // https://localhost : contexte sécurisé → micro (getUserMedia) et WebRTC autorisés
    allowMixedContent: false,
  },
  server: { androidScheme: 'https' },
  backgroundColor: '#0b0710',
};

export default config;
