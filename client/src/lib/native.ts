/**
 * Intégration Android (Capacitor). Sans effet dans un navigateur.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

interface HostServicePlugin {
  start(o: { text: string }): Promise<void>;
  stop(): Promise<void>;
}
const HostService = registerPlugin<HostServicePlugin>('HostService');
let running = false;

export const isNative = () => Capacitor.isNativePlatform();

/** Garde l'appli en vie en arrière-plan tant qu'on héberge une partie en ligne. */
export async function setHosting(active: boolean, text = 'Partie en cours') {
  if (!isNative() || active === running) return;
  running = active;
  try {
    if (active) await HostService.start({ text });
    else await HostService.stop();
  } catch (e) {
    running = false;
    console.warn('[native] HostService', e);
  }
}
