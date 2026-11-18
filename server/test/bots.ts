/**
 * Test des bots : IA de cartes (unitaire) + une partie réelle d'1 humain passif contre 4 bots.
 * Usage : npm run test:bots
 */
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { createDeck, validatePlay, type Card, type ClientToServer, type FxEvent, type GameRoomState, type ServerToClient } from '../../shared/src/index';
import { chooseCards } from '../../shared/src/engine';

// ---------- IA de cartes ----------
const deck = createDeck();
const of = (rank: number, n = 1): Card[] => deck.filter((c) => c.rank === rank).slice(0, n);
for (let i = 0; i < 2000; i++) {
  const hand = [...deck].sort(() => Math.random() - 0.5).slice(0, 1 + Math.floor(Math.random() * 9));
  const last = Math.random() < 0.5 ? null : { playerId: 'x', cards: of(3 + Math.floor(Math.random() * 11), 1 + Math.floor(Math.random() * 2)) };
  const play = chooseCards(hand, last);
  if (play) {
    assert.ok(play.every((c) => hand.includes(c)), 'le bot ne joue que ses cartes');
    assert.ok(validatePlay(play, last).ok, 'le bot ne propose que des coups valides');
  } else assert.ok(last, 'le bot ne passe jamais quand il ouvre le pli');
}
assert.deepEqual(chooseCards([...of(5), ...of(9)], { playerId: 'x', cards: of(4) }), of(5), 'joue la plus petite carte suffisante');
assert.deepEqual(chooseCards([...of(15), ...of(7)], null)?.map((c) => c.rank), [15], 'brûle avec ses 2 en ouverture');
console.log('✓ IA de cartes : 2000 situations aléatoires, toujours des coups légaux');

// ---------- Partie réelle ----------
const PORT = 3998;
const server = spawn('npx', ['tsx', 'src/server.ts'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
let serverErr = '';
server.stderr.on('data', (d) => { serverErr += d; process.stderr.write(d); });
await new Promise<void>((res) => server.stdout.on('data', (d) => String(d).includes('HEX DECK') && res()));

try {
  const s: Socket<ServerToClient, ClientToServer> = io(`http://localhost:${PORT}`, { transports: ['websocket'] });
  await new Promise((r) => s.on('connect', () => r(null)));
  let st: GameRoomState | null = null;
  const fx: FxEvent[] = [];
  const chat: string[] = [];
  s.on('state', (x) => (st = x));
  s.on('fx', (f) => fx.push(f));
  s.on('chat', (m) => chat.push(`${m.name}: ${m.text}`));
  await new Promise((r) => s.emit('lobby:create', { name: 'Testeur', cosmetics: { color: '#c51111', hat: 'none' } }, r));
  for (let i = 0; i < 4; i++) s.emit('lobby:addBot');
  await new Promise((r) => setTimeout(r, 200));
  const lobby = st as GameRoomState | null;
  assert.equal(lobby?.players.filter((p) => p.isBot).length, 4);
  assert.equal(new Set(lobby?.players.map((p) => p.cosmetics.color)).size, 5, 'couleurs distinctes');
  console.log('✓ 4 bots ajoutés :', lobby!.players.filter((p) => p.isBot).map((p) => p.name).join(', '));

  s.emit('lobby:start');
  const startPos = new Map<string, string>();
  await new Promise((r) => setTimeout(r, 500));
  (st as GameRoomState | null)?.players.forEach((p) => startPos.set(p.id, `${p.x},${p.y}`));

  const seenSeated = new Set<string>();
  const seenRooms = new Set<string>();
  const t0 = Date.now();
  let meetings = 0;
  let lastPhase = '';
  while (Date.now() - t0 < 60000) {
    await new Promise((r) => setTimeout(r, 250));
    const cur = st as GameRoomState | null;
    if (!cur) continue;
    cur.players.forEach((p) => { if (p.seatedAt) seenSeated.add(p.id); if (p.isBot) seenRooms.add(`${Math.floor(p.x / 600)}-${Math.floor(p.y / 500)}`); });
    if (cur.phase === 'meeting' && lastPhase !== 'meeting') meetings++;
    lastPhase = cur.phase;
    if (cur.phase === 'ended') break;
  }
  const final = st as GameRoomState | null;
  const moved = final!.players.filter((p) => p.isBot && startPos.get(p.id) !== `${p.x},${p.y}`).length;
  const count = (t: string) => fx.filter((f) => f.type === t).length;
  console.log(`  bots qui ont bougé : ${moved}/4 · zones visitées : ${seenRooms.size} · joueurs assis à une table : ${seenSeated.size}`);
  console.log(`  cartes posées : ${count('play')} · plis brûlés : ${count('boom')} · sabotages : ${count('sabotage')} · réunions : ${meetings}`);
  console.log(`  panique : ${final!.panic}% · phase : ${final!.phase}${final!.winner ? ` · vainqueur : ${final!.winner.side} (${final!.winner.reason})` : ''}`);
  chat.filter((c) => !c.startsWith('Manoir')).slice(0, 4).forEach((c) => console.log('  💬', c));
  assert.ok(moved >= 3, 'les bots se déplacent');
  assert.ok(seenRooms.size >= 2, 'les bots changent de pièce (portes)');
  assert.ok(seenSeated.size >= 2, 'les bots s’assoient aux tables');
  assert.ok(count('play') + count('boom') >= 3, 'les bots jouent aux cartes');
  assert.equal(serverErr.trim(), '', 'aucune erreur serveur');
  console.log('✓ partie solo contre les bots');
  s.close();
} finally {
  server.kill();
}
process.exit(0);
