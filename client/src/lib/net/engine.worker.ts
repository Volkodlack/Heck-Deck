/**
 * Moteur HEX DECK exécuté dans un Web Worker chez l'hôte.
 * Un Worker n'est pas bridé comme l'onglet principal quand l'appli passe en arrière-plan,
 * et le jeu reste fluide même pendant le rendu Canvas.
 */
/// <reference lib="webworker" />
import { GameRoom, dispatchIntent, sanitizeJoin, type GameEndInfo } from '@shared/engine';
import type { JoinPayload, Role } from '@shared';

export type ToWorker =
  | { t: 'init'; code: string; hostId: string; payload: JoinPayload; bots?: number; forcedRoles?: Record<string, Role>; autoStart?: boolean; maxPlayers?: number }
  | { t: 'intent'; pid: string; ev: string; args: unknown[] }
  | { t: 'join'; pid: string; payload: JoinPayload }
  | { t: 'remove'; pid: string };

export type FromWorker =
  | { t: 'out'; to: string | null; ev: string; args: unknown[] }
  | { t: 'joinResult'; pid: string; ok: boolean; error?: string }
  | { t: 'gameEnd'; info: GameEndInfo }
  | { t: 'empty' };

const post = (m: FromWorker) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);
let room: GameRoom | null = null;

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  switch (m.t) {
    case 'init': {
      room = new GameRoom(m.code, {
        all: (ev, ...args) => post({ t: 'out', to: null, ev, args }),
        to: (id, ev, ...args) => post({ t: 'out', to: id, ev, args }),
      });
      room.onGameEnd = (info) => post({ t: 'gameEnd', info });
      room.onEmpty = () => post({ t: 'empty' });
      const p = sanitizeJoin(m.payload);
      room.addPlayer(m.hostId, p, p.accountId ?? null);
      if (m.maxPlayers) room.updateSettings(m.hostId, { maxPlayers: m.maxPlayers });
      if (m.forcedRoles) room.forcedRoles = m.forcedRoles;
      for (let i = 0; i < (m.bots ?? 0); i++) room.addBot(m.hostId);
      if (m.autoStart) room.start(m.hostId);
      break;
    }
    case 'intent':
      if (room) dispatchIntent(room, m.pid, m.ev, m.args);
      break;
    case 'join': {
      if (!room) return post({ t: 'joinResult', pid: m.pid, ok: false, error: 'Salle fermée.' });
      if (!room.isOpen) return post({ t: 'joinResult', pid: m.pid, ok: false, error: 'Salle pleine ou partie en cours.' });
      // On confirme AVANT d'ajouter : l'hôte marque l'invité comme admis, puis reçoit
      // dans l'ordre l'historique du chat et l'état diffusé par addPlayer.
      post({ t: 'joinResult', pid: m.pid, ok: true });
      const p = sanitizeJoin(m.payload);
      room.addPlayer(m.pid, p, p.accountId ?? null);
      break;
    }
    case 'remove':
      room?.removePlayer(m.pid);
      break;
  }
};
