/**
 * Serveurs ICE pour WebRTC (jeu P2P + voix).
 * - STUN Cloudflare (gratuit, illimité) + Google en secours.
 * - TURN Cloudflare (relais pour les réseaux stricts : 4G, Wi-Fi d'entreprise) via l'Edge Function
 *   Supabase `turn-credentials`, qui garde le secret côté serveur.
 */
import { supabase } from '../supabase';

const FALLBACK: RTCIceServer[] = [
  { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] },
];

let cached: { at: number; servers: RTCIceServer[] } | null = null;

export async function getIceServers(): Promise<RTCIceServer[]> {
  if (cached && Date.now() - cached.at < 3 * 3600 * 1000) return cached.servers;
  let servers = FALLBACK;
  if (supabase) {
    try {
      const { data, error } = await supabase.functions.invoke('turn-credentials', { method: 'POST' });
      if (!error && Array.isArray(data?.iceServers)) servers = data.iceServers;
    } catch { /* pas de TURN : STUN seul */ }
  }
  cached = { at: Date.now(), servers };
  return servers;
}
