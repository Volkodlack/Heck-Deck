/**
 * Connexion Socket.io + petit store global (pas de dépendance type Redux).
 * Les composants s'abonnent via useGame().
 */
import { io, type Socket } from 'socket.io-client';
import { useSyncExternalStore } from 'react';
import type { ChatMessage, ClientToServer, FxEvent, GameRoomState, PrivateState, Role, ServerToClient } from '@shared';

const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? (import.meta.env.DEV ? `http://${location.hostname}:3001` : location.origin);

export const socket: Socket<ServerToClient, ClientToServer> = io(SERVER_URL, { autoConnect: true, transports: ['websocket', 'polling'] });

// Accès console en développement (débogage / tests automatisés).
if (import.meta.env.DEV) (window as unknown as { __hexSocket: typeof socket }).__hexSocket = socket;

export interface FxInstance extends FxEvent { key: number; at: number }

interface Store {
  connected: boolean;
  state: GameRoomState | null;
  me: PrivateState | null;
  chat: ChatMessage[];
  fx: FxInstance[];
  toasts: { key: number; text: string }[];
  mediumResults: Record<string, Role>;
  /** Décalage d'horloge serveur → client (pour les timers). */
  clockSkew: number;
}

let store: Store = { connected: false, state: null, me: null, chat: [], fx: [], toasts: [], mediumResults: {}, clockSkew: 0 };
const listeners = new Set<() => void>();
const fxListeners = new Set<(f: FxEvent) => void>();
let seq = 0;

function set(patch: Partial<Store>) {
  store = { ...store, ...patch };
  listeners.forEach((l) => l());
}

export function useGame(): Store {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => store);
}
export const getStore = () => store;

/** Permet au moteur audio / canvas de réagir aux effets sans passer par React. */
export function onFx(cb: (f: FxEvent) => void): () => void { fxListeners.add(cb); return () => { fxListeners.delete(cb); }; }

export function toast(text: string) {
  const key = ++seq;
  set({ toasts: [...store.toasts, { key, text }].slice(-4) });
  setTimeout(() => set({ toasts: store.toasts.filter((t) => t.key !== key) }), 3500);
}

export function resetRoom() {
  set({ state: null, me: null, chat: [], fx: [], mediumResults: {} });
}

socket.on('connect', () => set({ connected: true }));
socket.on('disconnect', () => set({ connected: false, state: null, me: null }));
socket.on('state', (s) => set({ state: s, clockSkew: s.now - Date.now() }));
socket.on('you', (me) => set({ me }));
socket.on('chat', (m) => set({ chat: [...store.chat, m].slice(-80) }));
socket.on('toast', toast);
socket.on('medium:result', ({ targetId, role }) => set({ mediumResults: { ...store.mediumResults, [targetId]: role } }));
socket.on('fx', (f) => {
  const inst: FxInstance = { ...f, key: ++seq, at: Date.now() };
  set({ fx: [...store.fx, inst].slice(-6) });
  setTimeout(() => set({ fx: store.fx.filter((x) => x.key !== inst.key) }), 1600);
  fxListeners.forEach((l) => l(f));
});

/** Heure serveur estimée (ms). */
export const serverNow = () => Date.now() + store.clockSkew;
