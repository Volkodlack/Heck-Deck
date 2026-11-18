/**
 * HEX DECK — Salle de jeu autoritaire.
 * Le serveur est la seule source de vérité : mains, rôles, coups de cartes, sabotages, votes.
 * Les clients n'envoient que des INTENTIONS, toutes revalidées ici (anti-triche).
 *
 * Le moteur ne connaît aucun réseau : il parle à travers une `EngineOutput`. Il tourne donc
 * à l'identique sur un serveur Node (Socket.io), dans le navigateur de l'hôte (P2P / WebRTC)
 * ou hors-ligne (solo, tutoriel).
 */
import {
  BALANCE, BELL, FURNITURE, GHOST_PATH, INTERACT_RANGE, PLAYER_SPEED, RITUAL_TABLES, ROOMS, SLIP_RANGE, SPAWN,
  cardLabel, collides, createDeck, dist, isHex, rolePlan, seatPosition, shuffle, solidRects, validatePlay,
} from '../index';
import type {
  Card, ChatMessage, ClientToServer, Cosmetics, FxEvent, GameRoomState, Item, JoinPayload, PlayerPublic,
  PrivateState, Role, RoomId, RoomSettings, SabotageType, ServerToClient, TableState,
} from '../index';
import { BotDirector, BOT_NAMES } from './bots';

/** Sortie réseau abstraite du moteur. */
export interface EngineOutput {
  /** Envoi à tous les joueurs de la salle. */
  all<K extends keyof ServerToClient>(ev: K, ...args: Parameters<ServerToClient[K]>): void;
  /** Envoi à un seul joueur (sans effet pour un bot). */
  to<K extends keyof ServerToClient>(id: string, ev: K, ...args: Parameters<ServerToClient[K]>): void;
}

/** Résultat de fin de partie (pour les rapports de statistiques). */
export interface GameEndInfo {
  gameId: string;
  durationMs: number;
  winnerSide: NonNullable<GameRoomState['winner']>['side'];
  players: { id: string; accountId: string | null; isBot: boolean; role: Role; won: boolean }[];
}

export interface Player {
  id: string;
  isBot: boolean;
  userId: string | null;
  name: string;
  cosmetics: Cosmetics;
  x: number; y: number; facing: 1 | -1; moving: boolean;
  alive: boolean;
  connected: boolean;
  seatedAt: string | null;
  role: Role;
  hand: Card[];
  items: Item[];
  saltUntil: number;
  uvUntil: number;
  slipReadyAt: number;
  searchReadyAt: number;
  ghostTouchReadyAt: number;
  mediumInspectUsed: boolean;
  bellUsed: boolean;
  revealed: boolean;
  lastMoveAt: number;
}

const PALETTE = ['#c51111', '#132ed1', '#117f2d', '#ed54ba', '#ef7d0d', '#f5f557', '#3f474e', '#d6e0f0', '#6b2fbb', '#71491e', '#38fedc', '#50ef39'];
const ROLE_FR: Record<Role, string> = { survivor: 'Survivant', possessed: 'Possédé', medium: 'Médium', skirmisher: 'Joueur' };

export class GameRoom {
  readonly code: string;
  private out: EngineOutput;
  /** @internal lu par les bots */ players = new Map<string, Player>();
  private hostId = '';
  /** @internal lu par les bots */ phase: GameRoomState['phase'] = 'lobby';
  private settings: RoomSettings = { maxPlayers: 8, mediumEnabled: true };
  private deck: Card[] = [];
  private discard: Card[] = [];
  private panic = 0;
  /** @internal lu par les bots */ skirmish = false;
  /** @internal lu par les bots */ sabotage = { lightsOutUntil: 0, voiceJamUntil: 0, locked: null as { room: RoomId; until: number } | null, readyAt: 0 };
  /** @internal lu par les bots */ tables: TableState[] = [];
  /** @internal lu par les bots */ meeting: GameRoomState['meeting'] = null;
  private votes = new Map<string, string>();
  private ghost = { x: GHOST_PATH[0].x, y: GHOST_PATH[0].y, active: false, wp: 1 };
  private winner: GameRoomState['winner'] = null;
  private lastPassivePanic = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private gameId = '';
  private startedAt = 0;
  /** Rôles imposés (tutoriel). */
  forcedRoles: Record<string, Role> = {};
  /** Appelé à la fin de chaque partie. */
  onGameEnd: (info: GameEndInfo) => void = () => {};
  private lastTick = Date.now();
  private chatLog: ChatMessage[] = [];
  private bots = new BotDirector(this);
  /** Appelé quand la salle est vide pour la retirer du registre. */
  onEmpty: () => void = () => {};

  constructor(code: string, out: EngineOutput) {
    this.code = code;
    this.out = out;
    this.resetTables();
    this.timer = setInterval(() => this.tick(), 1000 / 15);
  }

  /* ============================== Lobby ============================== */

  get size() { return [...this.players.values()].filter((p) => p.connected).length; }
  get humans() { return [...this.players.values()].filter((p) => p.connected && !p.isBot).length; }
  get isOpen() { return this.phase === 'lobby' && this.size < this.settings.maxPlayers; }

  /** Ajoute un joueur humain. `accountId` = id de compte annoncé (vérifié plus tard par les rapports croisés). */
  addPlayer(id: string, p: JoinPayload, userId: string | null) {
    // Couleur déjà prise ? On attribue la première couleur libre de la palette.
    const taken = new Set([...this.players.values()].map((x) => x.cosmetics.color.toLowerCase()));
    if (taken.has(p.cosmetics.color.toLowerCase())) {
      const free = PALETTE.find((c) => !taken.has(c));
      if (free) p = { ...p, cosmetics: { ...p.cosmetics, color: free } };
    }
    const player: Player = {
      id, isBot: false, userId, name: p.name.slice(0, 16) || 'Invité', cosmetics: p.cosmetics,
      x: SPAWN.x, y: SPAWN.y, facing: 1, moving: false, alive: true, connected: true, seatedAt: null,
      role: 'survivor', hand: [], items: [], saltUntil: 0, uvUntil: 0, slipReadyAt: 0, searchReadyAt: 0,
      ghostTouchReadyAt: 0, mediumInspectUsed: false, bellUsed: false, revealed: false, lastMoveAt: Date.now(),
    };
    this.players.set(id, player);
    if (!this.hostId) this.hostId = id;
    this.chatLog.forEach((m) => this.out.to(id, 'chat', m));
    this.system(`${player.name} a rejoint le manoir.`);
    this.broadcast();
  }

  removePlayer(id: string) {
    const p = this.players.get(id);
    if (!p) return;
    if (p.seatedAt) this.leaveTable(p);
    if (this.phase === 'lobby') this.players.delete(id);
    else { p.connected = false; p.alive = false; p.revealed = true; }
    this.system(`${p.name} a quitté la partie.`);
    if (this.hostId === id) {
      const next = [...this.players.values()].find((x) => x.connected);
      this.hostId = next?.id ?? '';
    }
    if (this.humans === 0) { this.destroy(); return; }
    this.out.all('rtc:peers', this.connectedIds());
    this.checkWin();
    this.broadcast();
  }

  updateSettings(by: string, s: Partial<RoomSettings>) {
    if (by !== this.hostId || this.phase !== 'lobby') return;
    if (s.maxPlayers) this.settings.maxPlayers = Math.max(2, Math.min(8, Math.round(s.maxPlayers)));
    if (typeof s.mediumEnabled === 'boolean') this.settings.mediumEnabled = s.mediumEnabled;
    this.broadcast();
  }

  updateCosmetics(id: string, c: Cosmetics) {
    const p = this.players.get(id);
    if (!p || this.phase !== 'lobby') return;
    p.cosmetics = c;
    this.broadcast();
  }

  /** Ajoute un joueur IA (hôte uniquement, en lobby). */
  addBot(by: string) {
    if (by !== this.hostId || this.phase !== 'lobby' || this.size >= this.settings.maxPlayers) return;
    const used = new Set([...this.players.values()].map((p) => p.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${this.size + 1}`;
    const takenColors = new Set([...this.players.values()].map((p) => p.cosmetics.color));
    const color = PALETTE.find((c) => !takenColors.has(c)) ?? '#3f474e';
    const hats: Cosmetics['hat'][] = ['none', 'tophat', 'witch', 'candle', 'horns'];
    const id = `bot-${rid()}`;
    this.players.set(id, {
      id, isBot: true, userId: null, name, cosmetics: { color, hat: hats[Math.floor(Math.random() * hats.length)] },
      x: SPAWN.x, y: SPAWN.y, facing: 1, moving: false, alive: true, connected: true, seatedAt: null,
      role: 'survivor', hand: [], items: [], saltUntil: 0, uvUntil: 0, slipReadyAt: 0, searchReadyAt: 0,
      ghostTouchReadyAt: 0, mediumInspectUsed: false, bellUsed: false, revealed: false, lastMoveAt: Date.now(),
    });
    this.system(`🤖 ${name} (IA) rejoint le manoir.`);
    this.broadcast();
  }

  removeBot(by: string, botId: string) {
    const b = this.players.get(botId);
    if (by !== this.hostId || this.phase !== 'lobby' || !b?.isBot) return;
    this.players.delete(botId);
    this.system(`🤖 ${b.name} est reparti.`);
    this.broadcast();
  }

  /** Déplacement d'un bot (collisions vérifiées, pas de contrôle de latence réseau). */
  botMove(p: Player, x: number, y: number, facing: 1 | -1, moving: boolean) {
    if (!p.isBot || !p.alive || this.phase !== 'explore' || p.seatedAt) return;
    p.x = x; p.y = y; p.facing = facing; p.moving = moving;
  }

  chat(id: string, text: string) {
    const p = this.players.get(id);
    const clean = text.trim().slice(0, 200);
    if (!p || !clean) return;
    // En jeu, le chat écrit n'est ouvert que pendant les réunions (et aux vivants).
    if (this.phase === 'explore' || (this.phase === 'meeting' && !p.alive)) return;
    this.pushChat({ id: rid(), from: id, name: p.name, text: clean, at: Date.now() });
  }

  start(by: string) {
    if (by !== this.hostId || (this.phase !== 'lobby' && this.phase !== 'ended')) return;
    // Nettoyage des déconnectés d'une partie précédente.
    for (const [id, p] of this.players) if (!p.connected) this.players.delete(id);
    const list = shuffle([...this.players.values()]);
    if (list.length < 2) return this.toast(by, 'Il faut au moins 2 joueurs.');

    const plan = rolePlan(list.length, this.settings.mediumEnabled);
    this.skirmish = plan.skirmish;
    this.deck = shuffle(createDeck());
    this.discard = [];
    this.panic = 0;
    this.winner = null;
    this.meeting = null;
    this.votes.clear();
    this.sabotage = { lightsOutUntil: 0, voiceJamUntil: 0, locked: null, readyAt: Date.now() + 15000 };
    this.ghost = { x: GHOST_PATH[0].x, y: GHOST_PATH[0].y, active: plan.skirmish, wp: 1 };
    this.resetTables();

    this.gameId = uuid();
    this.startedAt = Date.now();
    // Rôles imposés (tutoriel) : on échange avec un joueur qui a reçu ce rôle.
    const forced = Object.entries(this.forcedRoles);
    list.forEach((p, i) => {
      p.role = plan.skirmish ? 'skirmisher' : i < plan.possessed ? 'possessed' : i < plan.possessed + plan.medium ? 'medium' : 'survivor';
      Object.assign(p, {
        alive: true, seatedAt: null, items: [], hand: [], saltUntil: 0, uvUntil: 0, slipReadyAt: Date.now() + 10000,
        searchReadyAt: 0, ghostTouchReadyAt: 0, mediumInspectUsed: false, bellUsed: false, revealed: false,
      });
      const a = (i / list.length) * Math.PI * 2;
      p.x = BELL.x + Math.cos(a) * 110;
      p.y = BELL.y + Math.sin(a) * 110;
    });

    for (const [fid, role] of forced) {
      const fp = this.players.get(fid);
      if (!fp || fp.role === role) continue;
      const swap = list.find((x) => x !== fp && x.role === role);
      if (swap) { swap.role = fp.role; fp.role = role; }
    }

    // Distribution : les Possédés reçoivent d'abord des cartes Maudites à refiler.
    for (const p of list) {
      if (p.role === 'possessed') {
        for (let k = 0; k < BALANCE.possessedHexCards; k++) {
          const idx = this.deck.findIndex(isHex);
          if (idx >= 0) p.hand.push(this.deck.splice(idx, 1)[0]);
        }
        this.draw(p, BALANCE.startHandPossessed - p.hand.length);
      } else {
        this.draw(p, plan.skirmish ? 7 : BALANCE.startHandSurvivor);
      }
    }

    this.phase = 'explore';
    this.lastPassivePanic = Date.now();
    this.system(plan.skirmish ? 'Mode Escarmouche : le Fantôme rôde. Videz votre main en premier !' : `La partie commence. ${plan.possessed} Possédé(s) se cache(nt) parmi vous…`);
    this.out.all('rtc:peers', this.connectedIds());
    this.players.forEach((p) => this.sendPrivate(p));
    this.broadcast();
  }

  /* ============================ Exploration ============================ */

  move(id: string, m: { x: number; y: number; facing: 1 | -1; moving: boolean }) {
    const p = this.players.get(id);
    if (!p || !p.alive || this.phase !== 'explore' || p.seatedAt) return;
    if (!Number.isFinite(m.x) || !Number.isFinite(m.y)) return;
    const now = Date.now();
    const dt = Math.min(1, (now - p.lastMoveAt) / 1000);
    const maxStep = PLAYER_SPEED * dt * 1.6 + 12;
    const rects = solidRects(this.lockedRoom());
    const wasStuck = collides(p.x, p.y, rects);
    // Anti-téléportation / anti-traversée de murs : on refuse le mouvement (le client est recalé).
    if (dist(p, m) > maxStep || (!wasStuck && collides(m.x, m.y, rects))) return;
    p.x = m.x; p.y = m.y; p.facing = m.facing === -1 ? -1 : 1; p.moving = !!m.moving; p.lastMoveAt = now;
  }

  search(id: string, furnitureId: string) {
    const p = this.players.get(id);
    const f = FURNITURE.find((x) => x.id === furnitureId);
    const now = Date.now();
    if (!p || !f || !p.alive || this.phase !== 'explore' || p.seatedAt) return;
    if (dist(p, f) > INTERACT_RANGE + 20) return;
    if (now < p.searchReadyAt) return this.toast(id, 'Tu viens de fouiller… patiente un peu.');
    p.searchReadyAt = now + BALANCE.searchCooldownMs;

    const roll = Math.random();
    if (roll < 0.4) {
      const item: Item = Math.random() < 0.5 ? 'uv' : 'salt';
      if (p.items.length < 3) p.items.push(item);
      this.fx({ type: 'search', text: item === 'uv' ? 'LAMPE UV !' : 'SEL !', x: f.x, y: f.y, only: id });
    } else if (roll < 0.8 && p.hand.length > 0) {
      // Échange : la carte la plus faible part à la défausse, on en pioche une nouvelle.
      const weakest = p.hand.reduce((a, b) => (b.rank < a.rank ? b : a));
      p.hand = p.hand.filter((c) => c !== weakest);
      this.discard.push(weakest);
      const [drawn] = this.draw(p, 1);
      this.fx({ type: 'search', text: drawn ? `${cardLabel(weakest)} → ${cardLabel(drawn)}` : 'VIDE…', x: f.x, y: f.y, only: id });
    } else {
      this.fx({ type: 'search', text: 'RIEN…', x: f.x, y: f.y, only: id });
    }
    this.sendPrivate(p);
  }

  useItem(id: string, item: Item) {
    const p = this.players.get(id);
    if (!p || !p.alive || this.phase !== 'explore') return;
    const idx = p.items.indexOf(item);
    if (idx < 0) return;
    p.items.splice(idx, 1);
    const now = Date.now();
    if (item === 'uv') p.uvUntil = now + BALANCE.uvDurationMs;
    else p.saltUntil = now + BALANCE.saltDurationMs;
    this.toast(id, item === 'uv' ? 'Lampe UV allumée : tu vois dans le noir.' : 'Cercle de sel : aucune Hex Card ne peut t’atteindre.');
    this.sendPrivate(p);
  }

  /* ============================ Tables de rituel ============================ */

  sit(id: string, tableId: string) {
    const p = this.players.get(id);
    const t = this.tables.find((x) => x.id === tableId);
    if (!p || !t || !p.alive || this.phase !== 'explore' || p.seatedAt) return;
    if (dist(p, t) > INTERACT_RANGE + 60) return;
    if (t.seats.length >= t.maxSeats) return this.toast(id, 'Table complète.');
    if (p.hand.length === 0) return this.toast(id, 'Ta main est vide, tu n’as rien à jouer.');
    t.seats.push(p.id);
    p.seatedAt = t.id;
    p.moving = false;
    this.placeSeated(t);
    if (!t.active && t.seats.length >= 2) {
      t.active = true;
      t.lastPlay = null;
      t.passed = [];
      t.turn = t.seats[0];
      this.fx({ type: 'play', text: 'RITUEL !', tableId: t.id, x: t.x, y: t.y });
    }
    this.broadcast();
  }

  leave(id: string) {
    const p = this.players.get(id);
    if (p?.seatedAt) this.leaveTable(p);
    this.broadcast();
  }

  play(id: string, cardIds: string[]) {
    const p = this.players.get(id);
    const t = p?.seatedAt ? this.tables.find((x) => x.id === p.seatedAt) : undefined;
    if (!p || !t || !t.active || t.turn !== p.id || this.phase !== 'explore') return;
    const ids = [...new Set(cardIds)];
    const cards = ids.map((cid) => p.hand.find((c) => c.id === cid)).filter(Boolean) as Card[];
    if (cards.length !== ids.length) return this.toast(id, 'Carte introuvable dans ta main.');
    const check = validatePlay(cards, t.lastPlay);
    if (!check.ok) return this.toast(id, check.reason);

    p.hand = p.hand.filter((c) => !ids.includes(c.id));
    this.discard.push(...cards);

    if (check.burns) {
      t.lastPlay = null; // (les cartes du pli sont déjà en défausse)
      t.passed = [];
      t.turn = p.id; // le joueur relance
      this.fx({ type: 'boom', text: cards[0].rank === 16 ? 'POLTERGEIST!' : 'BOUM!', tableId: t.id, x: t.x, y: t.y });
    } else {
      t.lastPlay = { playerId: p.id, cards };
      t.passed = [];
      this.fx({ type: 'play', tableId: t.id });
      this.advanceTurn(t);
    }

    if (p.hand.length === 0) {
      const cursed = cards.some(isHex);
      if (cursed && !this.skirmish) {
        this.addPanic(BALANCE.cursePanic);
        this.fx({ type: 'curse', text: 'MALÉDICTION!', x: t.x, y: t.y });
        this.system(`${p.name} a fini sur une carte Maudite ! +${BALANCE.cursePanic}% de Panique.`);
      } else {
        this.fx({ type: 'win', text: 'LIBÉRÉ!', x: t.x, y: t.y, tableId: t.id });
        this.system(`${p.name} a vidé sa main !`);
      }
      this.leaveTable(p);
    }
    this.sendPrivate(p);
    this.checkWin();
    this.broadcast();
  }

  pass(id: string) {
    const p = this.players.get(id);
    const t = p?.seatedAt ? this.tables.find((x) => x.id === p.seatedAt) : undefined;
    if (!p || !t || !t.active || t.turn !== p.id) return;
    if (!t.lastPlay) return this.toast(id, 'Tu ouvres le pli : tu dois poser une carte.');
    t.passed.push(p.id);
    this.fx({ type: 'pass', tableId: t.id });
    const others = t.seats.filter((s) => s !== t.lastPlay!.playerId);
    if (others.every((s) => t.passed.includes(s))) {
      // Tout le monde a passé : pli ramassé, le dernier poseur relance.
      const leader = t.lastPlay.playerId;
      t.lastPlay = null;
      t.passed = [];
      t.turn = t.seats.includes(leader) ? leader : t.seats[0];
    } else {
      this.advanceTurn(t);
    }
    this.broadcast();
  }

  private advanceTurn(t: TableState) {
    if (t.seats.length === 0) { t.turn = null; return; }
    const i = t.turn ? t.seats.indexOf(t.turn) : -1;
    for (let k = 1; k <= t.seats.length; k++) {
      const next = t.seats[(i + k + t.seats.length) % t.seats.length];
      if (!t.passed.includes(next) || !t.lastPlay) { t.turn = next; return; }
    }
    t.turn = t.seats[0];
  }

  private leaveTable(p: Player) {
    const t = this.tables.find((x) => x.id === p.seatedAt);
    p.seatedAt = null;
    if (!t) return;
    const wasTurn = t.turn === p.id;
    const idx = t.seats.indexOf(p.id);
    if (wasTurn) this.advanceTurn(t);
    t.seats = t.seats.filter((s) => s !== p.id);
    t.passed = t.passed.filter((s) => s !== p.id);
    // Se décaler hors de la table pour ne pas rester "dans" la chaise.
    p.y = t.y + 110;
    p.x = t.x + (idx - 1) * 30;
    if (t.seats.length < 2) {
      t.active = false;
      t.lastPlay = null;
      t.passed = [];
      t.turn = null;
    } else if (t.turn === p.id || !t.turn) {
      t.turn = t.seats[Math.min(idx, t.seats.length - 1)];
    }
    // Si celui qui a posé en dernier est parti et que tout le monde a passé, on ramasse.
    if (t.lastPlay && t.seats.filter((s) => s !== t.lastPlay!.playerId).every((s) => t.passed.includes(s))) {
      t.lastPlay = null;
      t.passed = [];
    }
    this.placeSeated(t);
  }

  private placeSeated(t: TableState) {
    const def = RITUAL_TABLES.find((x) => x.id === t.id)!;
    t.seats.forEach((sid, i) => {
      const sp = this.players.get(sid);
      if (sp) Object.assign(sp, seatPosition(def, i));
    });
  }

  private resetTables(unseat = true) {
    if (unseat) this.players.forEach((p) => (p.seatedAt = null));
    this.tables = RITUAL_TABLES.map((t) => ({ id: t.id, x: t.x, y: t.y, maxSeats: t.maxSeats, seats: [], turn: null, lastPlay: null, passed: [], active: false }));
  }

  /* ============================ Possédés ============================ */

  doSabotage(id: string, s: { type: SabotageType; room?: RoomId; tableId?: string }) {
    const p = this.players.get(id);
    const now = Date.now();
    if (!p || !p.alive || p.role !== 'possessed' || this.phase !== 'explore') return;
    if (now < this.sabotage.readyAt) return this.toast(id, 'Les esprits se reposent… (recharge)');

    let label = 'SABOTAGE!';
    switch (s.type) {
      case 'lights':
        this.sabotage.lightsOutUntil = now + BALANCE.lightsDurationMs;
        label = 'BLACKOUT!';
        break;
      case 'lock': {
        if (!s.room || !(s.room in ROOMS)) return;
        this.sabotage.locked = { room: s.room, until: now + BALANCE.lockDurationMs };
        label = `${ROOMS[s.room].name.toUpperCase()} VERROUILLÉ!`;
        break;
      }
      case 'jam':
        this.sabotage.voiceJamUntil = now + BALANCE.jamDurationMs;
        label = 'BROUILLAGE!';
        break;
      case 'blast': {
        const t = this.tables.find((x) => x.id === s.tableId);
        if (!t || !t.active || t.seats.includes(p.id)) return this.toast(id, 'Aucune table active à faire sauter.');
        const victims = t.seats.map((sid) => this.players.get(sid)!).filter(Boolean);
        victims.forEach((v) => { this.draw(v, 1); this.sendPrivate(v); });
        victims.forEach((v) => this.leaveTable(v));
        this.fx({ type: 'boom', text: 'KABOOM!', x: t.x, y: t.y, tableId: t.id });
        label = 'TABLE EXPLOSÉE!';
        break;
      }
      default:
        return;
    }
    this.sabotage.readyAt = now + BALANCE.sabotageCooldownMs;
    this.addPanic(BALANCE.sabotagePanic);
    this.fx({ type: 'sabotage', text: label });
    this.checkWin();
    this.broadcast();
  }

  slip(id: string, targetId: string, cardId: string) {
    const p = this.players.get(id);
    const v = this.players.get(targetId);
    const now = Date.now();
    if (!p || !v || p === v || !p.alive || !v.alive || p.role !== 'possessed' || v.role === 'possessed') return;
    if (this.phase !== 'explore' || now < p.slipReadyAt) return;
    if (dist(p, v) > SLIP_RANGE + 10) return this.toast(id, 'Trop loin.');
    const card = p.hand.find((c) => c.id === cardId);
    if (!card || !isHex(card)) return this.toast(id, 'Tu ne peux refiler qu’une Hex Card (As ou 2).');
    p.slipReadyAt = now + BALANCE.slipCooldownMs;
    if (v.saltUntil > now) {
      this.fx({ type: 'blocked', text: 'BLOQUÉ!', x: v.x, y: v.y, only: id });
      this.toast(v.id, 'Ton cercle de sel a repoussé une malédiction !');
    } else {
      p.hand = p.hand.filter((c) => c !== card);
      v.hand.push(card);
      this.fx({ type: 'hexed', text: 'HEXED!', x: v.x, y: v.y, only: id });
      this.toast(v.id, 'Un frisson glacé… ta main semble plus lourde.');
      if (v.isBot) this.bots.onHexed(v, p);
      this.sendPrivate(v);
    }
    this.sendPrivate(p);
  }

  inspect(id: string, targetId: string) {
    const p = this.players.get(id);
    const v = this.players.get(targetId);
    if (!p || !v || p.role !== 'medium' || p.mediumInspectUsed || !p.alive) return;
    p.mediumInspectUsed = true;
    this.out.to(id, 'medium:result', { targetId, role: v.role });
    this.sendPrivate(p);
  }

  /* ============================ Réunion & vote ============================ */

  ringBell(id: string) {
    const p = this.players.get(id);
    if (!p || !p.alive || this.phase !== 'explore' || this.skirmish) return;
    if (dist(p, BELL) > INTERACT_RANGE + 20) return;
    if (p.bellUsed) return this.toast(id, 'Tu as déjà sonné la cloche cette partie.');
    p.bellUsed = true;
    this.resetTables();
    const alive = [...this.players.values()].filter((x) => x.alive);
    alive.forEach((x, i) => {
      const a = (i / alive.length) * Math.PI * 2;
      x.x = BELL.x + Math.cos(a) * 130;
      x.y = BELL.y + Math.sin(a) * 130;
      x.moving = false;
    });
    this.phase = 'meeting';
    this.votes.clear();
    this.meeting = { endsAt: Date.now() + BALANCE.meetingDurationMs, calledBy: id, votedIds: [], result: null };
    this.fx({ type: 'bell', text: 'RÉUNION!' });
    this.system(`${p.name} a sonné la Cloche d’urgence !`);
    this.broadcast();
  }

  vote(id: string, target: string) {
    const p = this.players.get(id);
    if (!p || !p.alive || this.phase !== 'meeting' || !this.meeting || this.meeting.result) return;
    if (this.votes.has(id)) return;
    if (target !== 'skip' && !this.players.get(target)?.alive) return;
    this.votes.set(id, target);
    this.meeting.votedIds.push(id);
    const aliveCount = [...this.players.values()].filter((x) => x.alive).length;
    if (this.votes.size >= aliveCount) this.resolveVote();
    this.broadcast();
  }

  private resolveVote() {
    if (!this.meeting || this.meeting.result) return;
    const tally: Record<string, number> = {};
    this.votes.forEach((t) => (tally[t] = (tally[t] ?? 0) + 1));
    const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    let eliminated: string | null = null;
    if (sorted.length && sorted[0][0] !== 'skip' && (sorted.length === 1 || sorted[0][1] > sorted[1][1])) eliminated = sorted[0][0];
    this.meeting.result = { eliminated, tally };
    this.meeting.endsAt = Date.now() + BALANCE.meetingResultMs;
    if (eliminated) {
      const v = this.players.get(eliminated)!;
      v.alive = false;
      v.revealed = true;
      this.fx({ type: 'eliminated', text: 'AU PLACARD!' });
      this.system(`${v.name} est enfermé dans le Placard à Balais… C’était un ${ROLE_FR[v.role]}.`);
    } else {
      this.system('Personne n’est éliminé.');
    }
  }

  /* ============================ Boucle & victoire ============================ */

  private tick() {
    const now = Date.now();
    const dt = Math.min(0.2, (now - this.lastTick) / 1000);
    this.lastTick = now;
    if (this.phase === 'lobby' || this.phase === 'ended') return;

    if (this.sabotage.locked && now > this.sabotage.locked.until) this.sabotage.locked = null;

    if (this.phase === 'explore' || this.phase === 'meeting') this.bots.tick(now, dt);

    if (this.phase === 'meeting' && this.meeting) {
      if (!this.meeting.result && now >= this.meeting.endsAt) this.resolveVote();
      else if (this.meeting.result && now >= this.meeting.endsAt) {
        this.meeting = null;
        this.phase = 'explore';
        this.players.forEach((p) => (p.lastMoveAt = now));
        this.checkWin();
      }
    }

    if (this.phase === 'explore') {
      if (now - this.lastPassivePanic > BALANCE.passivePanicEveryMs) {
        this.lastPassivePanic = now;
        this.addPanic(BALANCE.passivePanicAmount);
      }
      if (this.ghost.active) this.tickGhost(dt, now);
      this.checkWin();
    }
    this.broadcast();
  }

  /** Le Fantôme patrouille, traque le joueur le plus proche et lui fait piocher une carte au contact. */
  private tickGhost(dt: number, now: number) {
    const g = this.ghost;
    const alive = [...this.players.values()].filter((p) => p.alive);
    const prey = alive.map((p) => ({ p, d: dist(p, g) })).sort((a, b) => a.d - b.d)[0];
    const target = prey && prey.d < 220 ? prey.p : GHOST_PATH[g.wp];
    const d = dist(g, target);
    const speed = BALANCE.ghostSpeed * (prey && prey.d < 220 ? 1.25 : 1);
    if (d > 1) { g.x += ((target.x - g.x) / d) * speed * dt; g.y += ((target.y - g.y) / d) * speed * dt; }
    if (target === GHOST_PATH[g.wp] && d < 10) g.wp = (g.wp + 1) % GHOST_PATH.length;
    for (const p of alive) {
      if (dist(p, g) < 34 && now > p.ghostTouchReadyAt) {
        p.ghostTouchReadyAt = now + BALANCE.ghostTouchCooldownMs;
        this.draw(p, BALANCE.ghostTouchCards);
        this.addPanic(2);
        this.fx({ type: 'ghost', text: 'BOUH!', x: p.x, y: p.y });
        this.sendPrivate(p);
      }
    }
  }

  private checkWin() {
    if (this.phase !== 'explore' && this.phase !== 'meeting') return;
    if (this.meeting && !this.meeting.result) return; // on attend la fin du vote
    const all = [...this.players.values()];
    const alive = all.filter((p) => p.alive);

    if (this.skirmish) {
      const done = alive.find((p) => p.hand.length === 0);
      if (done) return this.end('player', [done.id], `${done.name} a vidé sa main en premier !`);
      if (this.panic >= 100) return this.end('ghost', [], 'Le Fantôme a rendu tout le monde fou…');
      if (alive.length === 0) return this.end('ghost', [], 'Plus personne dans le manoir.');
      return;
    }
    const possessedAlive = alive.filter((p) => p.role === 'possessed');
    const goodAlive = alive.filter((p) => p.role !== 'possessed');
    const survivorsAlive = alive.filter((p) => p.role === 'survivor');
    const mediumIds = alive.filter((p) => p.role === 'medium').map((p) => p.id);
    const possessedIds = all.filter((p) => p.role === 'possessed').map((p) => p.id);
    const survivorIds = all.filter((p) => p.role === 'survivor').map((p) => p.id);

    if (this.panic >= 100) return this.end('possessed', [...possessedIds, ...mediumIds], 'La Panique a englouti le manoir.');
    if (possessedAlive.length === 0) return this.end('survivors', [...survivorIds, ...mediumIds], 'Tous les Possédés sont au placard !');
    if (goodAlive.length <= 1) return this.end('possessed', [...possessedIds, ...mediumIds], 'Il ne reste qu’un seul Survivant…');
    if (survivorsAlive.length > 0 && survivorsAlive.every((p) => p.hand.length === 0))
      return this.end('survivors', [...survivorIds, ...mediumIds], 'Tous les Survivants ont vidé leur main !');
  }

  private end(side: NonNullable<GameRoomState['winner']>['side'], playerIds: string[], reason: string) {
    this.phase = 'ended';
    this.meeting = null;
    this.winner = { side, playerIds, reason };
    this.players.forEach((p) => (p.revealed = true));
    this.resetTables();
    this.fx({ type: 'win', text: side === 'possessed' ? 'POSSÉDÉS!' : side === 'survivors' ? 'SURVIVANTS!' : side === 'ghost' ? 'GAME OVER' : 'VICTOIRE!' });
    this.system(`FIN : ${reason}`);
    // Statistiques persistantes (si Supabase configuré côté serveur).
    try {
      this.onGameEnd({
        gameId: this.gameId, durationMs: Date.now() - this.startedAt, winnerSide: side,
        players: [...this.players.values()].map((p) => ({ id: p.id, accountId: p.userId, isBot: p.isBot, role: p.role, won: playerIds.includes(p.id) })),
      });
    } catch (e) { console.warn('[engine] onGameEnd', e); }
    this.broadcast();
  }

  /* ============================ Utilitaires ============================ */

  private lockedRoom(): RoomId | null {
    return this.sabotage.locked && this.sabotage.locked.until > Date.now() ? this.sabotage.locked.room : null;
  }

  private draw(p: Player, n: number): Card[] {
    const out: Card[] = [];
    for (let i = 0; i < n; i++) {
      if (this.deck.length === 0) { this.deck = shuffle(this.discard); this.discard = []; }
      const c = this.deck.pop();
      if (!c) break;
      p.hand.push(c);
      out.push(c);
    }
    return out;
  }

  private addPanic(n: number) { this.panic = Math.max(0, Math.min(100, this.panic + n)); }
  private connectedIds() { return [...this.players.values()].filter((p) => p.connected && !p.isBot).map((p) => p.id); }
  private toast(id: string, text: string) { this.out.to(id, 'toast', text); }

  private fx(f: FxEvent) {
    if (f.only) this.out.to(f.only, 'fx', f);
    else this.out.all('fx', f);
  }

  private system(text: string) {
    this.pushChat({ id: rid(), from: 'system', name: 'Manoir', text, at: Date.now(), system: true });
  }

  private pushChat(m: ChatMessage) {
    this.chatLog.push(m);
    if (this.chatLog.length > 60) this.chatLog.shift();
    this.out.all('chat', m);
  }

  private sendPrivate(p: Player) {
    const partners = p.role === 'possessed' ? [...this.players.values()].filter((x) => x.role === 'possessed' && x !== p).map((x) => x.id) : [];
    const priv: PrivateState = {
      role: p.role, hand: p.hand, items: p.items, partners, saltUntil: p.saltUntil, uvUntil: p.uvUntil,
      slipReadyAt: p.slipReadyAt, mediumInspectUsed: p.mediumInspectUsed, bellUsed: p.bellUsed,
    };
    if (!p.isBot) this.out.to(p.id, 'you', priv);
  }

  broadcast() {
    const players: PlayerPublic[] = [...this.players.values()].map((p) => ({
      id: p.id, name: p.name, cosmetics: p.cosmetics, x: Math.round(p.x), y: Math.round(p.y), facing: p.facing,
      moving: p.moving, alive: p.alive, seatedAt: p.seatedAt, handCount: p.hand.length, isHost: p.id === this.hostId,
      revealedRole: p.revealed ? p.role : null, connected: p.connected, isBot: p.isBot, accountId: p.userId,
    }));
    const state: GameRoomState = {
      code: this.code, phase: this.phase, hostId: this.hostId, settings: this.settings, players, panic: Math.round(this.panic),
      sabotage: { ...this.sabotage, locked: this.lockedRoom() ? this.sabotage.locked : null }, tables: this.tables,
      meeting: this.meeting, ghost: { x: this.ghost.x, y: this.ghost.y, active: this.ghost.active },
      deckCount: this.deck.length, skirmish: this.skirmish, winner: this.winner, now: Date.now(),
      gameId: this.gameId, startedAt: this.startedAt,
    };
    this.out.all('state', state);
  }

  destroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.onEmpty();
  }
}

const rid = () => Math.random().toString(36).slice(2, 10);
const uuid = (): string =>
  typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); });
