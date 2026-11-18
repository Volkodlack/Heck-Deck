/**
 * Connexion Socket.io + petit store global (pas de dépendance type Redux).
 * Les composants s'abonnent via useGame().
 */
import { useSyncExternalStore } from 'react';
import type { ChatMessage, FxEvent, GameRoomState, PrivateState, Role } from '@shared';
import { net } from './net/proxy';

/** Alias historique : `socket` est le proxy réseau (local, P2P ou serveur dédié). */
export const socket = net;
export { net };

// Accès console en développement (débogage / tests automatisés).
if (import.meta.env.DEV) Object.assign(window, { __hexSocket: socket, __hexStore: () => store });

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
  /** Partie de tutoriel en cours. */
  tutorial: boolean;
}

let store: Store = { connected: false, state: null, me: null, chat: [], fx: [], toasts: [], mediumResults: {}, clockSkew: 0, tutorial: false };
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
export const setTutorial = (tutorial: boolean) => set({ tutorial });

/** Permet au moteur audio / canvas de réagir aux effets sans passer par React. */
export function onFx(cb: (f: FxEvent) => void): () => void { fxListeners.add(cb); return () => { fxListeners.delete(cb); }; }

export function toast(text: string) {
  const key = ++seq;
  set({ toasts: [...store.toasts, { key, text }].slice(-4) });
  setTimeout(() => set({ toasts: store.toasts.filter((t) => t.key !== key) }), 3500);
}

/** Quitte la salle courante (ferme le moteur local / la connexion). */
export function resetRoom() {
  net.detach('leave');
  set({ state: null, me: null, chat: [], fx: [], mediumResults: {} });
}

socket.on('connect', () => set({ connected: true }));
socket.on('disconnect', () => set({ connected: false, state: null, me: null, chat: [], fx: [], mediumResults: {}, tutorial: false }));
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
