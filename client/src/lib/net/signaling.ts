/**
 * Mise en relation P2P via Supabase Realtime (canal "broadcast" par code de salle).
 * Ne transporte que la poignée de main WebRTC : une fois connectés, les joueurs
 * échangent directement entre eux et Supabase ne voit plus rien passer.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../supabase';

export type SignalMsg =
  | { t: 'ping'; from: string }
  | { t: 'pong'; from: string }
  | { t: 'hello'; from: string; payload: unknown }
  | { t: 'offer'; from: string; to: string; sdp: string }
  | { t: 'answer'; from: string; to: string; sdp: string }
  | { t: 'ice'; from: string; to: string; c: RTCIceCandidateInit }
  | { t: 'reject'; from: string; to: string; reason: string };

/** En développement sans Supabase : signalisation entre onglets du même navigateur (BroadcastChannel). */
const devLocal = !supabase && import.meta.env.DEV && typeof BroadcastChannel !== 'undefined';
export const p2pAvailable = () => !!supabase || devLocal;

export class RoomChannel {
  private ch: RealtimeChannel | null = null;
  private bc: BroadcastChannel | null = null;
  private handlers = new Set<(m: SignalMsg) => void>();

  constructor(code: string) {
    if (supabase) {
      this.ch = supabase.channel(`hexdeck-${code}`, { config: { broadcast: { self: false, ack: false } } });
      this.ch.on('broadcast', { event: 'sig' }, ({ payload }) => this.handlers.forEach((h) => h(payload as SignalMsg)));
    } else if (devLocal) {
      this.bc = new BroadcastChannel(`hexdeck-${code}`);
      this.bc.onmessage = (e) => this.handlers.forEach((h) => h(e.data as SignalMsg));
    } else throw new Error('Supabase non configuré : le mode en ligne est indisponible.');
  }

  subscribe(): Promise<void> {
    if (this.bc) return Promise.resolve();
    const ch = this.ch!;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Signalisation injoignable.')), 10000);
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(timer); reject(new Error('Signalisation injoignable.')); }
      });
    });
  }

  send(msg: SignalMsg) {
    if (this.bc) this.bc.postMessage(msg);
    else void this.ch?.send({ type: 'broadcast', event: 'sig', payload: msg });
  }
  onMessage(fn: (m: SignalMsg) => void) { this.handlers.add(fn); return () => { this.handlers.delete(fn); }; }
  close() {
    this.bc?.close();
    if (this.ch) void supabase?.removeChannel(this.ch);
  }
}
