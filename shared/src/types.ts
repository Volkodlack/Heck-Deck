/**
 * HEX DECK — Types partagés client / serveur.
 * Toute donnée qui transite par Socket.io est décrite ici.
 */

/** Rang d'une carte : 3..13 = 3..Roi, 14 = As, 15 = 2, 16 = Poltergeist (Joker). */
export type Rank = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16;
export type Suit = 'S' | 'H' | 'D' | 'C' | 'X'; // X = Joker

export interface Card {
  id: string; // ex: "14H", "16X1"
  rank: Rank;
  suit: Suit;
}

export type Role = 'survivor' | 'possessed' | 'medium' | 'skirmisher';
export type Phase = 'lobby' | 'explore' | 'meeting' | 'ended';
export type Item = 'uv' | 'salt';
export type SabotageType = 'lights' | 'lock' | 'jam' | 'blast';
export type RoomId = 'hall' | 'kitchen' | 'library' | 'cellar' | 'attic';

export interface Cosmetics {
  color: string;
  hat: 'none' | 'tophat' | 'witch' | 'candle' | 'horns';
}

export interface PlayerPublic {
  id: string;
  name: string;
  cosmetics: Cosmetics;
  x: number;
  y: number;
  facing: 1 | -1;
  moving: boolean;
  alive: boolean;
  seatedAt: string | null;
  handCount: number;
  isHost: boolean;
  /** Rôle révélé (après élimination ou fin de partie), sinon null. */
  revealedRole: Role | null;
  connected: boolean;
}

export interface TablePlay {
  playerId: string;
  cards: Card[];
}

export interface TableState {
  id: string;
  x: number;
  y: number;
  maxSeats: number;
  seats: string[]; // ordre de jeu
  turn: string | null; // id du joueur dont c'est le tour
  lastPlay: TablePlay | null;
  /** Joueurs ayant passé depuis la dernière pose. */
  passed: string[];
  active: boolean;
}

export interface SabotageState {
  lightsOutUntil: number;
  voiceJamUntil: number;
  locked: { room: RoomId; until: number } | null;
  /** Prochain sabotage possible (cooldown partagé entre Possédés). */
  readyAt: number;
}

export interface MeetingState {
  endsAt: number;
  calledBy: string;
  votedIds: string[]; // qui a déjà voté (pas pour qui : vote secret jusqu'au dépouillement)
  result: { eliminated: string | null; tally: Record<string, number> } | null;
}

export interface GhostState {
  x: number;
  y: number;
  active: boolean;
}

export interface RoomSettings {
  maxPlayers: number; // 2..8
  mediumEnabled: boolean;
}

export interface ChatMessage {
  id: string;
  from: string;
  name: string;
  text: string;
  at: number;
  system?: boolean;
}

export interface GameRoomState {
  code: string;
  phase: Phase;
  hostId: string;
  settings: RoomSettings;
  players: PlayerPublic[];
  panic: number; // 0..100
  sabotage: SabotageState;
  tables: TableState[];
  meeting: MeetingState | null;
  ghost: GhostState;
  deckCount: number;
  skirmish: boolean;
  winner: { side: 'survivors' | 'possessed' | 'ghost' | 'player'; playerIds: string[]; reason: string } | null;
  now: number;
}

/** État privé envoyé uniquement au joueur concerné. */
export interface PrivateState {
  role: Role;
  hand: Card[];
  items: Item[];
  /** Coéquipiers Possédés (visibles uniquement par les Possédés). */
  partners: string[];
  saltUntil: number;
  uvUntil: number;
  slipReadyAt: number;
  mediumInspectUsed: boolean;
  bellUsed: boolean;
}

export type FxType =
  | 'boom'
  | 'sabotage'
  | 'hexed'
  | 'curse'
  | 'bell'
  | 'search'
  | 'blocked'
  | 'eliminated'
  | 'ghost'
  | 'pass'
  | 'play'
  | 'win';

export interface FxEvent {
  type: FxType;
  text?: string;
  x?: number;
  y?: number;
  tableId?: string;
  /** Si défini, seul ce joueur doit voir l'effet. */
  only?: string;
}

/* ---------------------- Événements Socket.io ---------------------- */

export interface JoinPayload {
  name: string;
  cosmetics: Cosmetics;
  /** Jeton Supabase (facultatif) pour lier les statistiques au profil. */
  accessToken?: string;
}

export interface ClientToServer {
  'lobby:create': (p: JoinPayload, ack: (r: { ok: boolean; code?: string; error?: string }) => void) => void;
  'lobby:join': (p: JoinPayload & { code: string }, ack: (r: { ok: boolean; error?: string }) => void) => void;
  'lobby:settings': (s: Partial<RoomSettings>) => void;
  'lobby:cosmetics': (c: Cosmetics) => void;
  'lobby:start': () => void;
  'lobby:leave': () => void;
  chat: (text: string) => void;
  move: (p: { x: number; y: number; facing: 1 | -1; moving: boolean }) => void;
  search: (furnitureId: string) => void;
  'item:use': (item: Item) => void;
  'table:sit': (tableId: string) => void;
  'table:leave': () => void;
  'table:play': (cardIds: string[]) => void;
  'table:pass': () => void;
  sabotage: (p: { type: SabotageType; room?: RoomId; tableId?: string }) => void;
  'hex:slip': (p: { targetId: string; cardId: string }) => void;
  'medium:inspect': (targetId: string) => void;
  bell: () => void;
  vote: (targetId: string | 'skip') => void;
  'rtc:signal': (p: { to: string; data: unknown }) => void;
}

export interface ServerToClient {
  state: (s: GameRoomState) => void;
  you: (p: PrivateState) => void;
  fx: (f: FxEvent) => void;
  chat: (m: ChatMessage) => void;
  toast: (text: string) => void;
  'rtc:peers': (ids: string[]) => void;
  'rtc:signal': (p: { from: string; data: unknown }) => void;
  'medium:result': (p: { targetId: string; role: Role }) => void;
}
