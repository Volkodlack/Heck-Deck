/**
 * Test de fumée de bout en bout : lance le serveur, connecte 4 clients, crée un lobby,
 * démarre une partie, marche jusqu'à une table, joue des cartes, sonne la cloche et vote.
 * Usage : npm test (depuis la racine)
 */
import { spawn } from 'node:child_process';
import { io, type Socket } from 'socket.io-client';
import assert from 'node:assert/strict';
import { createDeck, validatePlay, type Card, type ClientToServer, type GameRoomState, type PrivateState, type ServerToClient } from '../../shared/src/index';

type C = Socket<ServerToClient, ClientToServer> & { st?: GameRoomState; me?: PrivateState; toasts: string[] };
const PORT = 3999;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- Règles pures ----------
const deck = createDeck();
assert.equal(deck.length, 54);
const c = (rank: number): Card => deck.find((x) => x.rank === rank)!;
assert.ok(validatePlay([c(5)], null).ok);
assert.ok(!validatePlay([c(5)], { playerId: 'a', cards: [c(7)] }).ok, 'plus faible refusé');
assert.ok(validatePlay([c(9)], { playerId: 'a', cards: [c(7)] }).ok);
const twos = deck.filter((x) => x.rank === 15);
const r = validatePlay([twos[0]], { playerId: 'a', cards: [c(14)] });
assert.ok(r.ok && r.burns, 'le 2 brûle');
const sevens = deck.filter((x) => x.rank === 7);
assert.ok(!validatePlay([c(9)], { playerId: 'a', cards: sevens.slice(0, 2) }).ok, 'quantité respectée');
console.log('✓ règles du jeu de cartes');

// ---------- Serveur ----------
const server = spawn('npx', ['tsx', 'src/server.ts'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
server.stderr.on('data', (d) => process.stderr.write(d));
await new Promise<void>((res) => server.stdout.on('data', (d) => String(d).includes('HEX DECK') && res()));

function client(): Promise<C> {
  return new Promise((res) => {
    const s = io(`http://localhost:${PORT}`, { transports: ['websocket'] }) as C;
    s.toasts = [];
    s.on('state', (st) => (s.st = st));
    s.on('you', (me) => (s.me = me));
    s.on('toast', (t) => s.toasts.push(t));
    s.on('connect', () => res(s));
  });
}

try {
  const players = await Promise.all([client(), client(), client(), client()]);
  const [host, ...rest] = players;
  const cos = { color: '#c51111', hat: 'none' as const };
  const code = await new Promise<string>((res) => host.emit('lobby:create', { name: 'Hôte', cosmetics: cos }, (a) => res(a.code!)));
  assert.match(code, /^[A-Z]{6}$/);
  for (const [i, p] of rest.entries()) {
    const ok = await new Promise<boolean>((res) => p.emit('lobby:join', { name: `P${i + 2}`, cosmetics: cos, code }, (a) => res(a.ok)));
    assert.ok(ok);
  }
  await sleep(150);
  assert.equal(host.st?.players.length, 4);
  console.log(`✓ lobby ${code} avec 4 joueurs`);

  host.emit('lobby:start');
  await sleep(300);
  assert.equal(host.st?.phase, 'explore');
  const roles = players.map((p) => p.me!.role);
  assert.equal(roles.filter((r) => r === 'possessed').length, 1, '1 Possédé à 4 joueurs');
  const possessed = players.find((p) => p.me!.role === 'possessed')!;
  assert.ok(possessed.me!.hand.some((x) => x.rank === 14 || x.rank === 15), 'le Possédé a des Hex Cards');
  assert.ok(host.st!.players.every((p) => p.revealedRole === null), 'rôles cachés');
  console.log('✓ rôles attribués :', roles.join(', '));

  // Anti-triche : téléportation refusée
  const before = host.st!.players.find((p) => p.id === host.id)!;
  host.emit('move', { x: 100, y: 100, facing: 1, moving: true });
  await sleep(120);
  const after = host.st!.players.find((p) => p.id === host.id)!;
  assert.deepEqual([after.x, after.y], [before.x, before.y], 'téléportation refusée');
  console.log('✓ anti-téléportation');

  // Deux survivants marchent jusqu'à la table de la Cave (300,760) en passant par la porte Cave↔Hall.
  const survivors = players.filter((p) => p !== possessed).slice(0, 2);
  async function walkTo(p: C, tx: number, ty: number) {
    let me = p.st!.players.find((x) => x.id === p.id)!;
    let { x, y } = me;
    for (let i = 0; i < 400; i++) {
      const dx = tx - x, dy = ty - y, d = Math.hypot(dx, dy);
      if (d < 5) break;
      const step = Math.min(10, d);
      x += (dx / d) * step; y += (dy / d) * step;
      p.emit('move', { x, y, facing: 1, moving: true });
      await sleep(50);
    }
    me = p.st!.players.find((x2) => x2.id === p.id)!;
    return me;
  }
  await Promise.all(survivors.map(async (p, i) => {
    await walkTo(p, 1000, 760 + i * 20);
    await walkTo(p, 400, 760 + i * 20);
  }));
  for (const p of survivors) {
    const me = p.st!.players.find((x) => x.id === p.id)!;
    assert.ok(Math.hypot(me.x - 400, me.y - 770) < 40, `arrivé près de la table (${me.x},${me.y})`);
    p.emit('table:sit', 't-cellar');
  }
  await sleep(200);
  const table = host.st!.tables.find((t) => t.id === 't-cellar')!;
  assert.equal(table.seats.length, 2);
  assert.ok(table.active);
  console.log('✓ deux joueurs assis, ronde lancée');

  // Coup hors-tour refusé
  const first = survivors.find((p) => p.id === table.turn)!;
  const second = survivors.find((p) => p !== first)!;
  second.emit('table:play', [second.me!.hand[0].id]);
  await sleep(120);
  assert.equal(host.st!.tables.find((t) => t.id === 't-cellar')!.lastPlay, null, 'hors-tour refusé');

  // Carte inexistante refusée
  first.emit('table:play', ['16X9']);
  await sleep(120);
  assert.ok(first.toasts.some((t) => t.includes('introuvable')));

  // Coup valide : la plus faible carte non-brûlante
  const lowest = first.me!.hand.filter((x) => x.rank < 15).sort((a, b) => a.rank - b.rank)[0];
  const handBefore = first.me!.hand.length;
  first.emit('table:play', [lowest.id]);
  await sleep(150);
  const t2 = host.st!.tables.find((t) => t.id === 't-cellar')!;
  assert.equal(t2.lastPlay?.cards[0].id, lowest.id);
  assert.equal(first.me!.hand.length, handBefore - 1);
  assert.equal(t2.turn, second.id);
  second.emit('table:pass');
  await sleep(150);
  const t3 = host.st!.tables.find((t) => t.id === 't-cellar')!;
  assert.equal(t3.lastPlay, null, 'pli ramassé après passe');
  assert.equal(t3.turn, first.id, 'le dernier poseur relance');
  console.log('✓ pose, passe et ramassage du pli validés côté serveur');

  // Réunion d'urgence : le Possédé va à la cloche (il est déjà dans le Hall)
  survivors.forEach((p) => p.emit('table:leave'));
  await walkTo(possessed, 1200, 830);
  possessed.emit('bell');
  await sleep(200);
  assert.equal(host.st!.phase, 'meeting');
  // Tout le monde vote contre le Possédé
  players.forEach((p) => p.emit('vote', p === possessed ? 'skip' : possessed.id!));
  await sleep(300);
  const res = host.st!.meeting?.result;
  assert.equal(res?.eliminated, possessed.id);
  await sleep(6500);
  assert.equal(host.st!.phase, 'ended');
  assert.equal(host.st!.winner?.side, 'survivors');
  console.log('✓ réunion, vote, élimination et victoire des Survivants');
  console.log('\nTOUS LES TESTS PASSENT 👻');
  players.forEach((p) => p.close());
} finally {
  server.kill();
}
process.exit(0);
