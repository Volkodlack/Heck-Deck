/**
 * Routage des intentions client → moteur, avec assainissement des entrées.
 * Utilisé à l'identique par le serveur Node, l'hôte P2P et le mode hors-ligne.
 * (Création / jonction de salle et signalisation WebRTC sont gérées par chaque transport.)
 */
import type { Cosmetics, JoinPayload, RoomId } from '../types';
import type { GameRoom } from './GameRoom';

const HATS: Cosmetics['hat'][] = ['none', 'tophat', 'witch', 'candle', 'horns'];

export function sanitizeJoin(p: Partial<JoinPayload> | undefined): JoinPayload {
  const color = /^#[0-9a-f]{6}$/i.test(p?.cosmetics?.color ?? '') ? p!.cosmetics!.color : '#c51111';
  const hat = HATS.includes(p?.cosmetics?.hat as Cosmetics['hat']) ? p!.cosmetics!.hat : 'none';
  const accountId = typeof p?.accountId === 'string' && /^[0-9a-f-]{36}$/i.test(p.accountId) ? p.accountId : undefined;
  return { name: String(p?.name ?? 'Invité').replace(/[<>]/g, '').trim().slice(0, 16) || 'Invité', cosmetics: { color, hat }, accountId };
}

/** Exécute une intention de jeu. Retourne false si l'événement est inconnu. */
export function dispatchIntent(room: GameRoom, id: string, ev: string, args: unknown[]): boolean {
  const a = args[0] as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  switch (ev) {
    case 'lobby:settings': room.updateSettings(id, a ?? {}); break;
    case 'lobby:cosmetics': room.updateCosmetics(id, sanitizeJoin({ cosmetics: a }).cosmetics); break;
    case 'lobby:start': room.start(id); break;
    case 'lobby:addBot': room.addBot(id); break;
    case 'lobby:removeBot': room.removeBot(id, String(a)); break;
    case 'chat': room.chat(id, String(a ?? '')); break;
    case 'move': if (a) room.move(id, a); break;
    case 'search': room.search(id, String(a)); break;
    case 'item:use': if (a === 'uv' || a === 'salt') room.useItem(id, a); break;
    case 'table:sit': room.sit(id, String(a)); break;
    case 'table:leave': room.leave(id); break;
    case 'table:play': if (Array.isArray(a)) room.play(id, a.map(String)); break;
    case 'table:pass': room.pass(id); break;
    case 'sabotage': if (a) room.doSabotage(id, { type: a.type, room: a.room as RoomId, tableId: a.tableId }); break;
    case 'hex:slip': if (a) room.slip(id, String(a.targetId), String(a.cardId)); break;
    case 'medium:inspect': room.inspect(id, String(a)); break;
    case 'bell': room.ringBell(id); break;
    case 'vote': room.vote(id, String(a)); break;
    default: return false;
  }
  return true;
}

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const newRoomCode = () => Array.from({ length: 6 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
