/**
 * Progression & statistiques.
 *
 * Les parties sont hébergées par les joueurs : aucun serveur central ne voit le jeu.
 * Chaque joueur connecté envoie donc SON rapport de fin de partie (avec son propre compte).
 * La base Supabase (supabase/schema.sql → submit_game_report) :
 *   - accorde toujours de l'XP (progression), plafonnée par jour, bots compris ;
 *   - ne compte une partie dans les STATS CLASSÉES que si au moins 2 comptes différents
 *     envoient des rapports concordants (même partie, même camp vainqueur), sans bots,
 *     avec au moins 3 humains et une durée minimale.
 */
import type { GameRoomState, PrivateState } from '@shared';
import { supabase } from './supabase';
import type { Session } from './session';

const TUTO_KEY = 'hexdeck:tutorialDone';
const reported = new Set<string>();

/** Courbe de niveau : niveau n atteint à 100·n·(n+1)/2 XP. */
export function levelOf(xp: number) {
  let level = 1;
  while (100 * level * (level + 1) / 2 <= xp) level++;
  const prev = 100 * (level - 1) * level / 2;
  const next = 100 * level * (level + 1) / 2;
  return { level, progress: (xp - prev) / (next - prev) };
}

export function tutorialDone(s: Session | null): boolean {
  try { if (localStorage.getItem(TUTO_KEY) === '1') return true; } catch { /* ignore */ }
  return !!s?.profile?.tutorial_done;
}

export async function markTutorialDone(s: Session | null) {
  try { localStorage.setItem(TUTO_KEY, '1'); } catch { /* ignore */ }
  if (supabase && s?.kind === 'user') await supabase.rpc('complete_tutorial');
}

/** Envoie le rapport de fin de partie du joueur courant (une seule fois par partie). */
export async function reportGame(state: GameRoomState, me: PrivateState, myId: string, s: Session | null, mode: string | null) {
  if (!supabase || s?.kind !== 'user' || !state.winner || !state.gameId || reported.has(state.gameId)) return;
  reported.add(state.gameId);
  const humans = state.players.filter((p) => !p.isBot);
  const { error } = await supabase.rpc('submit_game_report', {
    p_game_id: state.gameId,
    p_winner_side: state.winner.side,
    p_role: me.role,
    p_won: state.winner.playerIds.includes(myId),
    p_duration_s: Math.round((state.now - state.startedAt) / 1000),
    p_humans: humans.length,
    p_bots: state.players.length - humans.length,
    p_accounts: humans.map((p) => p.accountId).filter(Boolean),
    p_mode: mode ?? 'unknown',
  });
  if (error) console.warn('[progress] submit_game_report', error.message);
}
