/**
 * HEX DECK — Joueurs IA pour tester le jeu en solo.
 *
 * Les bots passent par les MÊMES méthodes que les humains (sit, play, pass, search, sabotage, slip,
 * bell, vote…) : le serveur valide leurs coups exactement comme ceux d'un joueur. Seul le
 * déplacement est direct (avec collisions), puisqu'il n'y a pas de latence réseau à contrôler.
 *
 * Comportements :
 * - Navigation pièce par pièce via les portes (BFS sur le graphe des pièces, évite la pièce verrouillée).
 * - Survivants / Médium : vont s'asseoir aux tables, fouillent les meubles, sonnent la cloche
 *   s'ils ont un suspect, accusent en réunion.
 * - Possédés : se fondent dans la masse, traquent un Survivant pour lui refiler une Hex Card,
 *   déclenchent des sabotages, votent contre un innocent ou passent.
 * - Jeu de cartes : joue le groupe le plus faible qui passe, garde les 2 pour brûler,
 *   se débarrasse des cartes Maudites avant la fin pour éviter la Malédiction.
 */
import {
  BELL, DOORS, FURNITURE, INTERACT_RANGE, PLAYER_SPEED, ROOMS, SLIP_RANGE, WALL,
  collides, dist, isHex, moveWithCollisions, roomAt, solidRects, validatePlay,
} from '../index';
import type { Card, RoomId, SabotageType, TablePlay } from '../index';
import type { GameRoom, Player } from './GameRoom';

export const BOT_NAMES = ['Bot Casper', 'Bot Boo', 'Bot Spectro', 'Bot Ectoplasme', 'Bot Banshee', 'Bot Wraith', 'Bot Grimoire', 'Bot Feu-Follet'];

type Pt = { x: number; y: number };
type Goal =
  | { kind: 'table'; id: string; pt: Pt }
  | { kind: 'search'; id: string; pt: Pt }
  | { kind: 'bell'; pt: Pt }
  | { kind: 'hunt'; id: string; pt: Pt }
  | { kind: 'wander'; pt: Pt };

interface Brain {
  goal: Goal | null;
  path: Pt[];
  nextThink: number;
  actAt: number; // délai "humain" avant de jouer une carte
  seatedSince: number;
  stuckSince: number;
  lastPos: Pt;
  suspicion: Record<string, number>;
  voteAt: number;
  spoke: boolean;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export class BotDirector {
  private brains = new Map<string, Brain>();
  constructor(private room: GameRoom) {}

  private brain(p: Player): Brain {
    let b = this.brains.get(p.id);
    if (!b) {
      b = { goal: null, path: [], nextThink: Date.now() + rnd(500, 2500), actAt: 0, seatedSince: 0, stuckSince: 0, lastPos: { x: p.x, y: p.y }, suspicion: {}, voteAt: 0, spoke: false };
      this.brains.set(p.id, b);
    }
    return b;
  }

  /** Appelé par la salle quand un bot reçoit une Hex Card : il soupçonne (souvent) le bon coupable. */
  onHexed(victim: Player, slipper: Player) {
    const b = this.brain(victim);
    const others = [...this.room.players.values()].filter((p) => p.alive && p.id !== victim.id);
    const nearest = others.sort((a, c) => dist(a, victim) - dist(c, victim));
    const suspect = Math.random() < 0.7 ? slipper : nearest.find((p) => p.id !== slipper.id) ?? slipper;
    b.suspicion[suspect.id] = (b.suspicion[suspect.id] ?? 0) + 2;
  }

  tick(now: number, dt: number) {
    for (const p of this.room.players.values()) {
      if (!p.isBot) continue;
      const b = this.brain(p);
      if (this.room.phase === 'meeting') { this.meeting(p, b, now); continue; }
      b.spoke = false;
      b.voteAt = 0;
      if (!p.alive) continue;
      if (p.seatedAt) { this.atTable(p, b, now); continue; }
      if (p.role === 'possessed') this.possessedPowers(p, b, now);
      if (now >= b.nextThink && !b.goal) this.decide(p, b, now);
      this.walk(p, b, now, dt);
    }
  }

  /* ============================ Décisions ============================ */

  private decide(p: Player, b: Brain, now: number) {
    b.nextThink = now + rnd(800, 2500);
    const r = this.room;
    const topSuspect = Object.entries(b.suspicion).filter(([id]) => r.players.get(id)?.alive).sort((a, c) => c[1] - a[1])[0];

    // Survivant avec un suspect sérieux → cloche
    if (p.role !== 'possessed' && !r.skirmish && !p.bellUsed && topSuspect && topSuspect[1] >= 2 && Math.random() < 0.5) {
      return this.setGoal(p, b, { kind: 'bell', pt: { x: BELL.x, y: BELL.y + 70 } });
    }
    // Médium : sonde une âme une fois, et retient le résultat
    if (p.role === 'medium' && !p.mediumInspectUsed && Math.random() < 0.25) {
      const target = pick([...r.players.values()].filter((x) => x.alive && x.id !== p.id));
      if (target) { r.inspect(p.id, target.id); if (target.role === 'possessed') b.suspicion[target.id] = (b.suspicion[target.id] ?? 0) + 3; }
    }
    // Objets en main → les utiliser au bon moment
    if (p.items.includes('salt') && Math.random() < 0.3) r.useItem(p.id, 'salt');
    if (p.items.includes('uv') && r.sabotage.lightsOutUntil > now) r.useItem(p.id, 'uv');

    const tables = r.tables.filter((t) => t.seats.length < t.maxSeats);
    const wantsCards = p.hand.length > 0 && (p.role !== 'possessed' || Math.random() < 0.35);
    if (wantsCards && tables.length && Math.random() < 0.65) {
      // Préfère une table où quelqu'un attend déjà
      const t = tables.sort((a, c) => (c.seats.length === 1 ? 1 : 0) - (a.seats.length === 1 ? 1 : 0) || dist(p, a) - dist(p, c))[0];
      return this.setGoal(p, b, { kind: 'table', id: t.id, pt: { x: t.x, y: t.y + 85 } });
    }
    if (Math.random() < 0.6) {
      const f = pick(FURNITURE);
      return this.setGoal(p, b, { kind: 'search', id: f.id, pt: this.approach(f) });
    }
    const room = ROOMS[pick(Object.keys(ROOMS) as RoomId[])];
    this.setGoal(p, b, { kind: 'wander', pt: { x: rnd(room.x + 80, room.x + room.w - 80), y: rnd(room.y + 80, room.y + room.h - 80) } });
  }

  private possessedPowers(p: Player, b: Brain, now: number) {
    const r = this.room;
    // Sabotage quand c'est rechargé (pas systématiquement, pour rester crédible)
    if (now >= r.sabotage.readyAt && Math.random() < 0.004) {
      const blastable = r.tables.filter((t) => t.active && !t.seats.includes(p.id));
      const types: SabotageType[] = ['lights', 'lights', 'lock', 'jam', ...(blastable.length ? ['blast', 'blast'] as SabotageType[] : [])];
      const type = pick(types);
      const humansRoom = [...r.players.values()].filter((x) => x.alive && x.role !== 'possessed').map((x) => roomAt(x.x, x.y)).filter(Boolean) as RoomId[];
      r.doSabotage(p.id, { type, room: humansRoom.length ? pick(humansRoom) : 'library', tableId: blastable[0]?.id });
    }
    // Refiler une Hex Card : traquer la victime la plus proche
    const hex = p.hand.find(isHex);
    if (!hex || now < p.slipReadyAt) { if (b.goal?.kind === 'hunt') b.goal = null; return; }
    const partners = new Set([...r.players.values()].filter((x) => x.role === 'possessed').map((x) => x.id));
    const victims = [...r.players.values()].filter((x) => x.alive && !partners.has(x.id)).sort((a, c) => dist(a, p) - dist(c, p));
    const v = victims[0];
    if (!v) return;
    if (dist(v, p) <= SLIP_RANGE) { r.slip(p.id, v.id, hex.id); b.goal = null; return; }
    if (b.goal?.kind !== 'hunt' || b.goal.id !== v.id || now > b.nextThink) {
      if (Math.random() < 0.02 || b.goal?.kind === 'hunt') { this.setGoal(p, b, { kind: 'hunt', id: v.id, pt: { x: v.x, y: v.y } }); b.nextThink = now + 1500; }
    }
  }

  private arrive(p: Player, b: Brain) {
    const g = b.goal!;
    b.goal = null;
    const r = this.room;
    if (g.kind === 'table') { r.sit(p.id, g.id); b.seatedSince = Date.now(); b.actAt = Date.now() + rnd(900, 2000); }
    if (g.kind === 'search') r.search(p.id, g.id);
    if (g.kind === 'bell') r.ringBell(p.id);
  }

  /* ============================ Table de cartes ============================ */

  private atTable(p: Player, b: Brain, now: number) {
    const r = this.room;
    const t = r.tables.find((x) => x.id === p.seatedAt);
    if (!t) return;
    if (!t.active) {
      if (now - b.seatedSince > 12000) r.leave(p.id); // personne ne vient
      return;
    }
    b.seatedSince = now;
    if (t.turn !== p.id) { b.actAt = Math.max(b.actAt, now + rnd(700, 1600)); return; }
    if (now < b.actAt) return;
    b.actAt = now + rnd(900, 1800);
    const cards = chooseCards(p.hand, t.lastPlay);
    if (cards) r.play(p.id, cards.map((c) => c.id));
    else r.pass(p.id);
    // Un Possédé quitte parfois la table pour aller saboter / chasser
    if (p.role === 'possessed' && Math.random() < 0.05) r.leave(p.id);
  }

  /* ============================ Réunion ============================ */

  private meeting(p: Player, b: Brain, now: number) {
    const r = this.room;
    const m = r.meeting;
    if (!m || m.result || !p.alive) return;
    if (!b.voteAt) b.voteAt = now + rnd(4000, 20000);
    const alive = [...r.players.values()].filter((x) => x.alive && x.id !== p.id);
    const top = Object.entries(b.suspicion).filter(([id]) => r.players.get(id)?.alive).sort((a, c) => c[1] - a[1])[0];

    if (!b.spoke && now > b.voteAt - 2500) {
      b.spoke = true;
      const name = (id: string) => r.players.get(id)?.name ?? '?';
      let line: string;
      if (p.role === 'possessed') {
        const scapegoat = pick(alive.filter((x) => x.role !== 'possessed'));
        line = Math.random() < 0.5 && scapegoat ? `${scapegoat.name} traînait près de moi juste avant… 🤨` : 'Moi j’étais à la table, j’ai rien vu.';
      } else if (top) line = `C’est ${name(top[0])} ! Il m’a refilé une carte maudite !`;
      else line = pick(['Aucune idée… je passe.', 'J’ai rien vu de louche.', 'On devrait passer ce vote.']);
      r.chat(p.id, line);
    }
    if (now < b.voteAt || m.votedIds.includes(p.id)) return;

    let target: string = 'skip';
    if (p.role === 'possessed') {
      const innocents = alive.filter((x) => x.role !== 'possessed');
      if (innocents.length && Math.random() < 0.45) target = pick(innocents).id;
    } else if (top && top[1] >= 2) target = top[0];
    else if (Math.random() < 0.15 && alive.length) target = pick(alive).id;
    r.vote(p.id, target);
  }

  /* ============================ Déplacement ============================ */

  private setGoal(p: Player, b: Brain, goal: Goal) {
    b.goal = goal;
    b.path = this.planPath(p, goal.pt);
    b.stuckSince = 0;
  }

  /** Point d'approche d'un meuble, du côté dégagé. */
  private approach(f: Pt): Pt {
    const room = ROOMS[roomAt(f.x, f.y) ?? 'hall'];
    const cx = room.x + room.w / 2, cy = room.y + room.h / 2;
    const d = Math.hypot(cx - f.x, cy - f.y) || 1;
    return { x: f.x + ((cx - f.x) / d) * (INTERACT_RANGE - 25), y: f.y + ((cy - f.y) / d) * (INTERACT_RANGE - 25) };
  }

  /** Chemin pièce par pièce (BFS) en passant par le milieu des portes. */
  private planPath(from: Pt, to: Pt): Pt[] {
    const start = roomAt(from.x, from.y);
    const end = roomAt(to.x, to.y);
    if (!start || !end || start === end) return [to];
    const locked = this.lockedRoom();
    const prev = new Map<RoomId, { room: RoomId; door: (typeof DOORS)[number] }>();
    const queue: RoomId[] = [start];
    const seen = new Set<RoomId>([start]);
    while (queue.length) {
      const cur = queue.shift()!;
      if (cur === end) break;
      for (const d of DOORS) {
        if (!d.rooms.includes(cur) || (locked && d.rooms.includes(locked))) continue;
        const next = d.rooms[0] === cur ? d.rooms[1] : d.rooms[0];
        if (seen.has(next)) continue;
        seen.add(next);
        prev.set(next, { room: cur, door: d });
        queue.push(next);
      }
    }
    if (!prev.has(end)) return []; // inaccessible (porte verrouillée) : on attend
    const pts: Pt[] = [to];
    let cur: RoomId = end;
    while (cur !== start) {
      const { room, door } = prev.get(cur)!;
      const c = { x: door.x + door.w / 2, y: door.y + door.h / 2 };
      const vertical = door.w === WALL;
      const off = 45;
      const fromRoom = ROOMS[room];
      const sideA = vertical ? { x: c.x + (fromRoom.x < c.x ? -off : off), y: c.y } : { x: c.x, y: c.y + (fromRoom.y < c.y ? -off : off) };
      const sideB = vertical ? { x: c.x - (sideA.x - c.x), y: c.y } : { x: c.x, y: c.y - (sideA.y - c.y) };
      pts.unshift(sideA, c, sideB);
      cur = room;
    }
    return pts;
  }

  private walk(p: Player, b: Brain, now: number, dt: number) {
    const g = b.goal;
    if (!g) { if (p.moving) this.room.botMove(p, p.x, p.y, p.facing, false); return; }
    if (g.kind === 'hunt') {
      const v = this.room.players.get(g.id);
      if (!v?.alive) { b.goal = null; return; }
      if (dist(g.pt, v) > 60) { g.pt = { x: v.x, y: v.y }; b.path = this.planPath(p, g.pt); }
    }
    if (!b.path.length) { b.path = this.planPath(p, g.pt); if (!b.path.length) { b.goal = null; return; } }
    const target = b.path[0];
    const d = dist(p, target);
    const reach = b.path.length === 1 ? (g.kind === 'hunt' ? SLIP_RANGE - 15 : 12) : 14;
    if (d <= reach) {
      b.path.shift();
      if (!b.path.length) this.arrive(p, b);
      return;
    }
    const step = Math.min(d, PLAYER_SPEED * 0.9 * dt);
    const dx = ((target.x - p.x) / d) * step, dy = ((target.y - p.y) / d) * step;
    const rects = solidRects(this.lockedRoom());
    const n = moveWithCollisions(p.x, p.y, dx, dy, rects);
    this.room.botMove(p, n.x, n.y, dx < 0 ? -1 : dx > 0 ? 1 : p.facing, true);

    // Anti-blocage : si on n'avance plus, on replanifie ou on abandonne l'objectif.
    if (dist(n, b.lastPos) < 0.5 || collides(n.x, n.y, rects)) {
      if (!b.stuckSince) b.stuckSince = now;
      else if (now - b.stuckSince > 1500) { b.goal = null; b.path = []; b.stuckSince = 0; b.nextThink = now + 500; }
    } else b.stuckSince = 0;
    b.lastPos = { x: n.x, y: n.y };
  }

  private lockedRoom(): RoomId | null {
    const l = this.room.sabotage.locked;
    return l && l.until > Date.now() ? l.room : null;
  }
}

/* ============================ IA de cartes ============================ */

/** Choisit un coup (ou null = passer). Fonction pure, testable. */
export function chooseCards(hand: Card[], lastPlay: TablePlay | null): Card[] | null {
  if (!hand.length) return null;
  const groups = new Map<number, Card[]>();
  for (const c of hand) groups.set(c.rank, [...(groups.get(c.rank) ?? []), c]);
  const twos = groups.get(15) ?? [];
  const jokers = groups.get(16) ?? [];
  const aces = groups.get(14) ?? [];
  const normal = [...groups.entries()].filter(([r]) => r < 14).sort((a, b) => a[0] - b[0]);
  const ok = (cards: Card[]) => validatePlay(cards, lastPlay).ok;

  if (!lastPlay) {
    // Brûler avec ses 2 est gratuit (on rejoue) et évite de finir sur une carte Maudite.
    if (twos.length && hand.length > twos.length) return twos;
    // Main presque vide : se débarrasser des As (Maudits) tant qu'il reste autre chose.
    if (aces.length && hand.length > aces.length && hand.length <= aces.length + 2) return aces;
    if (normal.length) return normal[0][1];
    if (aces.length) return aces;
    if (jokers.length) return [jokers[0]];
    return twos.length ? twos : null;
  }

  const n = lastPlay.cards.length;
  const prevRank = lastPlay.cards[0].rank;
  // Plus petit groupe suffisant qui bat le coup (As compris, on préfère s'en débarrasser tôt).
  const candidates = [...normal, ...(aces.length ? [[14, aces] as [number, Card[]]] : [])]
    .filter(([r, cs]) => r > prevRank && cs.length >= n)
    // On évite de casser un groupe plus gros si possible
    .sort((a, b) => (a[1].length === n ? 0 : 1) - (b[1].length === n ? 0 : 1) || a[0] - b[0]);
  if (candidates.length) {
    const play = candidates[0][1].slice(0, n);
    if (ok(play)) return play;
  }
  // Rien qui passe : brûler le pli si ça vaut le coup
  if (twos.length && (hand.length <= 4 || Math.random() < 0.5)) return [twos[0]];
  if (jokers.length && hand.length <= 5) return [jokers[0]];
  return null;
}
