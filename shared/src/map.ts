/**
 * HEX DECK — Plan du manoir (partagé : collisions client + validation serveur + atténuation vocale).
 *
 *   ┌─────────┬─────────────┬─────────┐
 *   │ Grenier │ Bibliothèque│ Cuisine │   y 0..500
 *   ├────  ───┼─────  ──────┼───  ────┤
 *   │  Cave   │         Hall (Cloche)  │   y 500..1000
 *   └─────────┴────────────────────────┘
 *   x 0..600    600..1200     1200..1800
 */
import type { RoomId } from './types';

export interface Rect { x: number; y: number; w: number; h: number }
export interface Door extends Rect { id: string; rooms: [RoomId, RoomId] }
export interface Furniture { id: string; x: number; y: number; room: RoomId; kind: 'wardrobe' | 'chest' | 'shelf' | 'barrel' | 'stove' | 'crate' }
export interface RitualTable { id: string; x: number; y: number; maxSeats: number }

export const WORLD = { w: 1800, h: 1000 };
export const WALL = 24;
export const PLAYER_RADIUS = 18;
export const PLAYER_SPEED = 220; // px / s
export const INTERACT_RANGE = 80;
export const SLIP_RANGE = 70;

export const ROOMS: Record<RoomId, Rect & { name: string; floor: string }> = {
  attic:   { x: 0,    y: 0,   w: 600,  h: 500, name: 'Grenier',      floor: '#2a2135' },
  library: { x: 600,  y: 0,   w: 600,  h: 500, name: 'Bibliothèque', floor: '#2b1e18' },
  kitchen: { x: 1200, y: 0,   w: 600,  h: 500, name: 'Cuisine',      floor: '#1d2a26' },
  cellar:  { x: 0,    y: 500, w: 600,  h: 500, name: 'Cave',         floor: '#1a1d22' },
  hall:    { x: 600,  y: 500, w: 1200, h: 500, name: 'Hall',         floor: '#2e1830' },
};

const DOOR = 110;

/** Portes (trous dans les murs intérieurs). Fermées = solides pendant un verrouillage. */
export const DOORS: Door[] = [
  { id: 'd-attic-library',  x: 600 - WALL / 2, y: 200, w: WALL, h: DOOR, rooms: ['attic', 'library'] },
  { id: 'd-library-kitchen',x: 1200 - WALL / 2,y: 200, w: WALL, h: DOOR, rooms: ['library', 'kitchen'] },
  { id: 'd-cellar-hall',    x: 600 - WALL / 2, y: 700, w: WALL, h: DOOR, rooms: ['cellar', 'hall'] },
  { id: 'd-attic-cellar',   x: 245, y: 500 - WALL / 2, w: DOOR, h: WALL, rooms: ['attic', 'cellar'] },
  { id: 'd-library-hall',   x: 845, y: 500 - WALL / 2, w: DOOR, h: WALL, rooms: ['library', 'hall'] },
  { id: 'd-kitchen-hall',   x: 1445,y: 500 - WALL / 2, w: DOOR, h: WALL, rooms: ['kitchen', 'hall'] },
];

/** Construit un mur horizontal découpé par les portes. */
function hWall(y: number, x1: number, x2: number): Rect[] {
  const gaps = DOORS.filter((d) => d.h === WALL && Math.abs(d.y + WALL / 2 - y) < 1 && d.x >= x1 && d.x < x2).sort((a, b) => a.x - b.x);
  const out: Rect[] = [];
  let cx = x1;
  for (const g of gaps) { out.push({ x: cx, y: y - WALL / 2, w: g.x - cx, h: WALL }); cx = g.x + g.w; }
  out.push({ x: cx, y: y - WALL / 2, w: x2 - cx, h: WALL });
  return out.filter((r) => r.w > 0);
}
function vWall(x: number, y1: number, y2: number): Rect[] {
  const gaps = DOORS.filter((d) => d.w === WALL && Math.abs(d.x + WALL / 2 - x) < 1 && d.y >= y1 && d.y < y2).sort((a, b) => a.y - b.y);
  const out: Rect[] = [];
  let cy = y1;
  for (const g of gaps) { out.push({ x: x - WALL / 2, y: cy, w: WALL, h: g.y - cy }); cy = g.y + g.h; }
  out.push({ x: x - WALL / 2, y: cy, w: WALL, h: y2 - cy });
  return out.filter((r) => r.h > 0);
}

export const WALLS: Rect[] = [
  // Murs extérieurs
  { x: 0, y: 0, w: WORLD.w, h: WALL },
  { x: 0, y: WORLD.h - WALL, w: WORLD.w, h: WALL },
  { x: 0, y: 0, w: WALL, h: WORLD.h },
  { x: WORLD.w - WALL, y: 0, w: WALL, h: WORLD.h },
  // Murs intérieurs
  ...hWall(500, 0, WORLD.w),
  ...vWall(600, 0, 1000),
  ...vWall(1200, 0, 500),
];

export const BELL = { x: 1200, y: 750 };

export const FURNITURE: Furniture[] = [
  { id: 'f-attic-chest',   x: 90,   y: 90,  room: 'attic',   kind: 'chest' },
  { id: 'f-attic-crate',   x: 480,  y: 400, room: 'attic',   kind: 'crate' },
  { id: 'f-lib-shelf1',    x: 700,  y: 70,  room: 'library', kind: 'shelf' },
  { id: 'f-lib-shelf2',    x: 1100, y: 70,  room: 'library', kind: 'shelf' },
  { id: 'f-kitchen-stove', x: 1700, y: 90,  room: 'kitchen', kind: 'stove' },
  { id: 'f-kitchen-crate', x: 1300, y: 420, room: 'kitchen', kind: 'crate' },
  { id: 'f-cellar-barrel', x: 90,   y: 600, room: 'cellar',  kind: 'barrel' },
  { id: 'f-cellar-barrel2',x: 500,  y: 920, room: 'cellar',  kind: 'barrel' },
  { id: 'f-hall-wardrobe', x: 1720, y: 930, room: 'hall',    kind: 'wardrobe' },
  { id: 'f-hall-chest',    x: 680,  y: 930, room: 'hall',    kind: 'chest' },
];

export const RITUAL_TABLES: RitualTable[] = [
  { id: 't-library', x: 900,  y: 270, maxSeats: 4 },
  { id: 't-cellar',  x: 300,  y: 760, maxSeats: 3 },
  { id: 't-kitchen', x: 1500, y: 250, maxSeats: 2 },
];

/** Waypoints de patrouille du Fantôme (mode Escarmouche). */
export const GHOST_PATH = [
  { x: 900, y: 700 }, { x: 1500, y: 700 }, { x: 1500, y: 300 }, { x: 900, y: 150 },
  { x: 300, y: 300 }, { x: 300, y: 700 }, { x: 900, y: 850 },
];

export const SPAWN = { x: BELL.x, y: BELL.y + 120 };

/* ------------------------------ Géométrie ------------------------------ */

export function roomAt(x: number, y: number): RoomId | null {
  for (const [id, r] of Object.entries(ROOMS) as [RoomId, Rect][]) {
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return id;
  }
  return null;
}

/** Murs solides actuels (les portes d'une pièce verrouillée deviennent des murs). */
export function solidRects(lockedRoom: RoomId | null): Rect[] {
  if (!lockedRoom) return WALLS;
  return [...WALLS, ...DOORS.filter((d) => d.rooms.includes(lockedRoom))];
}

export function circleHitsRect(cx: number, cy: number, r: number, rect: Rect): boolean {
  const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
}

export function collides(x: number, y: number, rects: Rect[], r = PLAYER_RADIUS): boolean {
  return rects.some((rect) => circleHitsRect(x, y, r, rect));
}

/** Déplacement avec glissement le long des murs (axes séparés). */
export function moveWithCollisions(x: number, y: number, dx: number, dy: number, rects: Rect[]) {
  // Si on est déjà coincé (ex : porte verrouillée sur soi), on laisse sortir librement.
  if (collides(x, y, rects)) return { x: x + dx, y: y + dy };
  let nx = x + dx;
  if (collides(nx, y, rects)) nx = x;
  let ny = y + dy;
  if (collides(nx, ny, rects)) ny = y;
  return { x: nx, y: ny };
}

function segIntersectsRect(x1: number, y1: number, x2: number, y2: number, r: Rect): boolean {
  // Liang–Barsky
  let t0 = 0, t1 = 1;
  const dx = x2 - x1, dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - r.x, r.x + r.w - x1, y1 - r.y, r.y + r.h - y1];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}

/** Nombre de murs entre deux points (sert à étouffer le chat vocal de proximité). */
export function wallsBetween(a: { x: number; y: number }, b: { x: number; y: number }, lockedRoom: RoomId | null = null): number {
  return solidRects(lockedRoom).reduce((n, r) => n + (segIntersectsRect(a.x, a.y, b.x, b.y, r) ? 1 : 0), 0);
}

export const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** Places autour d'une table de rituel (pour positionner les joueurs assis). */
export function seatPosition(t: RitualTable, index: number) {
  const angle = (index / t.maxSeats) * Math.PI * 2 - Math.PI / 2;
  return { x: t.x + Math.cos(angle) * 62, y: t.y + Math.sin(angle) * 62 };
}

/** Nombre de Possédés selon le nombre de joueurs. */
export function rolePlan(n: number, mediumEnabled: boolean) {
  if (n <= 3) return { skirmish: true, possessed: 0, medium: 0 };
  if (n <= 5) return { skirmish: false, possessed: 1, medium: 0 };
  return { skirmish: false, possessed: 2, medium: mediumEnabled ? 1 : 0 };
}
