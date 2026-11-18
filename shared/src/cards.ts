/**
 * HEX DECK — Logique pure du jeu de cartes (façon Puant / Président).
 * Utilisée par le serveur (validation anti-triche) ET par le client (aide à la sélection).
 *
 * Hiérarchie : 3 < 4 < ... < 10 < V < D < R < As < 2   (+ Poltergeist = Joker)
 * - On pose 1 carte, une paire, un brelan (ou un carré) de même valeur.
 * - Le suivant doit poser la MÊME quantité d'une valeur STRICTEMENT supérieure, ou passer.
 * - Un 2 (quelle que soit la quantité) ou un Poltergeist (seul) BRÛLE le pli : la table est
 *   vidée ("BOUM!") et le même joueur rejoue librement.
 * - Si tout le monde passe, le pli est ramassé et le dernier joueur à avoir posé relance.
 * - Cartes Maudites (Hex Cards) : les As et les 2. Finir sa main dessus = Malédiction.
 */
import type { Card, Rank, Suit, TablePlay } from './types';

export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
export const RANKS: Rank[] = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

export const RANK_LABEL: Record<number, string> = {
  3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'V', 12: 'D', 13: 'R', 14: 'A', 15: '2', 16: '★',
};

export const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣', X: '☠' };

/** Crée le paquet de 54 cartes (52 + 2 Poltergeists). */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ id: `${rank}${suit}`, rank, suit });
  deck.push({ id: '16X1', rank: 16, suit: 'X' }, { id: '16X2', rank: 16, suit: 'X' });
  return deck;
}

/** Mélange Fisher-Yates (fonction aléatoire injectable pour les tests). */
export function shuffle<T>(arr: T[], rnd: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Les As et les 2 sont des cartes Maudites. */
export const isHex = (c: Card): boolean => c.rank === 14 || c.rank === 15;
export const isBurner = (c: Card): boolean => c.rank === 15 || c.rank === 16;

export function sortHand(hand: Card[]): Card[] {
  return hand.slice().sort((a, b) => a.rank - b.rank || a.suit.localeCompare(b.suit));
}

export type PlayCheck = { ok: true; burns: boolean } | { ok: false; reason: string };

/** Valide une pose par rapport au dernier coup de la table. */
export function validatePlay(cards: Card[], lastPlay: TablePlay | null): PlayCheck {
  if (cards.length < 1 || cards.length > 4) return { ok: false, reason: 'Pose 1 à 4 cartes.' };
  const rank = cards[0].rank;
  if (!cards.every((c) => c.rank === rank)) return { ok: false, reason: 'Les cartes doivent avoir la même valeur.' };
  if (rank === 16 && cards.length > 1) return { ok: false, reason: 'Un Poltergeist se joue seul.' };

  // 2 ou Poltergeist : brûle le pli, jouable à tout moment.
  if (rank === 15 || rank === 16) return { ok: true, burns: true };

  if (!lastPlay) return { ok: true, burns: false };
  const prev = lastPlay.cards;
  if (cards.length !== prev.length) return { ok: false, reason: `Il faut poser ${prev.length} carte(s).` };
  if (rank <= prev[0].rank) return { ok: false, reason: 'Valeur strictement supérieure requise.' };
  return { ok: true, burns: false };
}

/** Libellé lisible d'une carte, ex : "A♥", "Poltergeist". */
export function cardLabel(c: Card): string {
  return c.rank === 16 ? 'Poltergeist' : `${RANK_LABEL[c.rank]}${SUIT_SYMBOL[c.suit]}`;
}
